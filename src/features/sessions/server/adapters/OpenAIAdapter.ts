import OpenAI from "openai";
import { clipToolOutput, type AgentEvent } from "@/features/sessions/model/AgentEvents";
import { type AgentAdapter, type AgentRequest } from "@/features/sessions/server/adapters/AgentAdapter";

const DEFAULT_MODEL = "gpt-5";

async function* run(request: AgentRequest): AsyncGenerator<AgentEvent> {
  // The Responses API calls MCP servers from OpenAI's side, so only remotely
  // reachable HTTP servers can be attached; local stdio servers are skipped.
  const tools = request.mcpServers.flatMap((server) =>
    server.transport === "http"
      ? [
          {
            type: "mcp" as const,
            server_label: server.name,
            server_url: server.url,
            headers: server.headers,
            require_approval: "never" as const,
          },
        ]
      : [],
  );

  try {
    // Constructed inside `try`: a missing OPENAI_API_KEY throws here.
    const client = new OpenAI();
    const stream = await client.responses.create(
      {
        model: request.model ?? DEFAULT_MODEL,
        input: request.prompt,
        tools,
        stream: true,
        // Responses are stored server-side by default, which is what makes this chain work.
        previous_response_id: request.sessionRef,
        reasoning: request.effort === undefined ? undefined : { effort: request.effort },
      },
      { signal: request.signal },
    );
    let output = "";
    for await (const event of stream) {
      if (event.type === "response.output_text.delta") {
        output += event.delta;
      } else if (event.type === "response.output_item.done" && event.item.type === "mcp_call") {
        yield {
          type: "tool",
          name: `${event.item.server_label}.${event.item.name}`,
          detail: event.item.arguments,
          id: event.item.id,
          result:
            typeof event.item.error === "string" && event.item.error !== ""
              ? { output: clipToolOutput(event.item.error), failed: true }
              : { output: clipToolOutput(event.item.output ?? ""), failed: false },
        };
      } else if (event.type === "response.completed") {
        // Each turn's response id is the handle for the next turn.
        yield { type: "session", ref: event.response.id };
        if (output !== "") yield { type: "text", text: output };
        yield { type: "done", output, costUsd: undefined };
        return;
      } else if (event.type === "response.failed" || event.type === "error") {
        yield { type: "error", message: JSON.stringify(event) };
        return;
      }
    }
    if (!request.signal.aborted) yield { type: "error", message: "OpenAI stream ended without completing" };
  } catch (error) {
    // An aborted request throws; the runtime records that as an interruption.
    if (request.signal.aborted) return;
    yield { type: "error", message: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * ### openaiAdapter
 *
 * Calls GPT models through the Responses API with remote MCP tools. Needs
 * `OPENAI_API_KEY`; it has no file or shell access, so it suits lightweight
 * lookup and summarisation steps.
 */
export const openaiAdapter: AgentAdapter = { kind: "openai", run };
