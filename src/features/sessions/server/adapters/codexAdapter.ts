import { Codex, type ThreadItem } from "@openai/codex-sdk";
import { clipToolOutput, type AgentEvent } from "@/features/sessions/model/AgentEvents";
import { type AgentAdapter, type AgentRequest } from "@/features/sessions/server/adapters/AgentAdapter";
import { codexCommand, codexExecutable } from "@/platform/agentBinaries";
import { predictCodexPrompt } from "@/features/sessions/server/adapters/codexPrediction";
import { errorMessage } from "@/lib/errors";
import { codexTools } from "@/features/sessions/server/adapters/codexTools";
import { codexSandbox } from "@/features/sessions/server/adapters/codexSandbox";
import { gitDirs } from "@/platform/git";
import { toCodexSetup } from "@/features/sessions/server/adapters/codexMcpSetup";

/** This process's environment plus `extra`; giving the SDK an environment replaces the inherited one. */
function codexEnv(extra: Record<string, string>): Record<string, string> {
  const inherited = Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined);
  return { ...Object.fromEntries(inherited), ...extra };
}

function describeItem(item: ThreadItem): AgentEvent | undefined {
  switch (item.type) {
    case "agent_message":
      return { type: "text", text: item.text };
    case "command_execution":
      return {
        type: "tool",
        name: "shell",
        detail: item.command,
        id: item.id,
        result: { output: clipToolOutput(item.aggregated_output), failed: item.exit_code !== undefined && item.exit_code !== 0 },
      };
    case "file_change":
      return {
        type: "tool",
        name: "patch",
        detail: item.changes.map((c) => `${c.kind} ${c.path}`).join(", "),
        id: item.id,
        result: { output: item.status === "failed" ? "The patch could not be applied" : "", failed: item.status === "failed" },
      };
    case "mcp_tool_call":
      return {
        type: "tool",
        name: `${item.server}.${item.tool}`,
        detail: JSON.stringify(item.arguments),
        id: item.id,
        result:
          // Typed as optional, but Codex sends `null` for no error.
          item.error?.message !== undefined
            ? { output: clipToolOutput(item.error.message), failed: true }
            : {
                output: clipToolOutput(
                  (item.result?.content ?? []).map((block) => ("text" in block && typeof block.text === "string" ? block.text : "")).join("\n"),
                ),
                failed: false,
              },
      };
    case "web_search":
      return { type: "tool", name: "web_search", detail: item.query };
    case "error":
      return { type: "text", text: `⚠ ${item.message}` };
    default:
      return undefined;
  }
}

async function* turn(request: AgentRequest): AsyncGenerator<AgentEvent> {
  const { config, secrets } = toCodexSetup(request.mcpServers);
  const sandbox = codexSandbox(request.allowGit, request.allowGit ? await gitDirs(request.workingDirectory) : []);
  const codex = new Codex({ ...codexExecutable(), config, configOverrides: sandbox.configOverrides, env: codexEnv(secrets) });
  const options = {
    model: request.model,
    modelReasoningEffort: request.effort,
    workingDirectory: request.workingDirectory,
    skipGitRepoCheck: true,
    // Writes stay inside the working directory; no approval prompts since no human is attached.
    sandboxMode: "workspace-write" as const,
    approvalPolicy: "never" as const,
    // Off, unless "Allow git" opens GitHub's hosts (and only those) to commands.
    networkAccessEnabled: sandbox.networkAccessEnabled,
  };
  const thread =
    request.sessionRef === undefined
      ? codex.startThread(options)
      : codex.resumeThread(request.sessionRef, options);

  const { events } = await thread.runStreamed(request.prompt, { signal: request.signal });
  let finalResponse = "";
  let threadId = request.sessionRef;

  for await (const event of events) {
    if (event.type === "thread.started") {
      threadId = event.thread_id;
      yield { type: "session", ref: event.thread_id };
    } else if (event.type === "item.completed") {
      if (event.item.type === "agent_message") finalResponse = event.item.text;
      const described = describeItem(event.item);
      if (described !== undefined) yield described;
    } else if (event.type === "turn.completed") {
      yield { type: "done", output: finalResponse, totals: undefined, usage: undefined };
      if (request.promptSuggestions && threadId !== undefined && !request.signal.aborted) {
        // In the background: the turn is over, and the suggestion follows when ready.
        request.onSuggestionWait(
          predictCodexPrompt({ command: codexCommand(), threadId, env: secrets, signal: request.suggestionSignal }).then((suggestion) => {
            if (suggestion !== undefined) request.onSuggestion(suggestion);
          }),
        );
      }
      return;
    } else if (event.type === "turn.failed") {
      yield { type: "error", message: event.error.message };
      return;
    } else if (event.type === "error") {
      yield { type: "error", message: event.message };
      return;
    }
  }
  if (!request.signal.aborted) {
    yield { type: "error", message: "Codex stream ended without completing the turn", failure: { code: "stream-ended", provider: "codex" } };
  }
}

// The SDK throws when the CLI fails to start, exits abnormally, or is
// aborted; the adapter contract turns those into events.
async function* run(request: AgentRequest): AsyncGenerator<AgentEvent> {
  try {
    yield* turn(request);
  } catch (error) {
    if (request.signal.aborted) return;
    yield { type: "error", message: errorMessage(error) };
  }
}

/**
 * ### codexAdapter
 *
 * Drives the Codex CLI through `@openai/codex-sdk`. Authenticates with
 * `OPENAI_API_KEY`, or with a ChatGPT login made via `pnpm exec codex login`.
 */
export const codexAdapter: AgentAdapter = { kind: "codex", tools: codexTools, run };
