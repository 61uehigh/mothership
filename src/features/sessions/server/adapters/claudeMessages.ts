import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { clipToolOutput, type AgentEvent, type UsageTotals } from "@/features/sessions/model/AgentEvents";
import { asRecord, stringAt, textOf } from "@/lib/unknownValues";

/**
 * ### SUBAGENT_TOOLS
 *
 * Claude's own sub-agent tool ("Task" in older Claude Code). Its calls are
 * reported as `subagent` events instead of tool calls, live and on import.
 */
export const SUBAGENT_TOOLS: ReadonlySet<string> = new Set(["Agent", "Task"]);

/**
 * ### ClaudeBlockEvent
 *
 * The events one content block of a Claude message can turn into.
 */
export type ClaudeBlockEvent = Extract<AgentEvent, { type: "text" | "tool" | "tool_result" | "subagent" }>;

function blocks(content: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(content)) return [];
  return content.flatMap((block) => {
    const record = asRecord(block);
    return record === undefined ? [] : [record];
  });
}

/**
 * ### assistantEvents
 *
 * The lead's own assistant message: its text, its tool calls, and the
 * sub-agents it starts. A sub-agent's id is added to `subagents`, so its
 * result is read as the sub-agent's end (see {@link toolResultEvents}).
 */
export function assistantEvents(content: unknown, subagents: Set<string>): Array<ClaudeBlockEvent> {
  return blocks(content).flatMap((block): Array<ClaudeBlockEvent> => {
    if (block.type === "text") return typeof block.text === "string" && block.text.trim() !== "" ? [{ type: "text", text: block.text }] : [];
    if (block.type !== "tool_use" || typeof block.name !== "string" || typeof block.id !== "string") return [];
    if (!SUBAGENT_TOOLS.has(block.name)) return [{ type: "tool", name: block.name, detail: JSON.stringify(block.input ?? {}), id: block.id }];
    subagents.add(block.id);
    return [
      {
        type: "subagent",
        phase: "start",
        id: block.id,
        description: stringAt(block.input, "description") ?? "Sub-agent",
        kind: stringAt(block.input, "subagent_type") ?? "general-purpose",
        model: stringAt(block.input, "model"),
      },
    ];
  });
}

/**
 * ### subagentStepEvents
 *
 * A message from inside a sub-agent: only its tool calls are kept, as steps
 * of the sub-agent that `parentToolUseId` started.
 */
export function subagentStepEvents(parentToolUseId: string, content: unknown): Array<ClaudeBlockEvent> {
  return blocks(content).flatMap((block): Array<ClaudeBlockEvent> =>
    block.type === "tool_use" && typeof block.name === "string" ? [{ type: "subagent", phase: "step", id: parentToolUseId, tool: block.name }] : [],
  );
}

/**
 * ### toolResultEvents
 *
 * The `tool_result` blocks of a user message: a tool's output, or the end of
 * a sub-agent listed in `subagents` (removed from it). Outputs are clipped
 * like every tool output.
 *
 * @param structured - The message's `tool_use_result`, when the stream has
 *   it: for a sub-agent it holds the report alone, while the block's text
 *   wraps it in a hand-back frame.
 */
export function toolResultEvents(content: unknown, subagents: Set<string>, structured?: unknown): Array<ClaudeBlockEvent> {
  return blocks(content).flatMap((block): Array<ClaudeBlockEvent> => {
    if (block.type !== "tool_result" || typeof block.tool_use_id !== "string") return [];
    const id = block.tool_use_id;
    const failed = block.is_error === true;
    if (!subagents.has(id)) return [{ type: "tool_result", id, output: clipToolOutput(textOf(block.content)), failed }];
    subagents.delete(id);
    const report = asRecord(structured)?.content;
    return [{ type: "subagent", phase: "end", id, output: clipToolOutput(textOf(report ?? block.content)), failed }];
  });
}

/**
 * The session's running totals from a result message: every model's tokens
 * (sub-agents included) and the estimated cost. Claude Code keeps counting
 * across resumed turns, so these grow turn after turn.
 */
function usageTotals(result: Extract<SDKMessage, { type: "result" }>, billing: UsageTotals["billing"]): UsageTotals {
  const models = Object.values(result.modelUsage);
  const sum = (pick: (model: (typeof models)[number]) => number) => models.reduce((total, model) => total + pick(model), 0);
  return {
    inputTokens: sum((m) => m.inputTokens),
    outputTokens: sum((m) => m.outputTokens),
    cacheReadTokens: sum((m) => m.cacheReadInputTokens),
    cacheWriteTokens: sum((m) => m.cacheCreationInputTokens),
    costUsd: result.total_cost_usd,
    billing,
  };
}

/**
 * ### ClaudeStreamState
 *
 * What {@link toAgentEvents} remembers between the messages of one turn.
 *
 * @property sessionReported - The `session` event was sent; it is sent once.
 * @property subagents - Tool calls of the lead that started a sub-agent and have not ended.
 */
export type ClaudeStreamState = { sessionReported: boolean; subagents: Set<string> };

/**
 * ### toAgentEvents
 *
 * One message of a live Claude stream as provider-neutral events. A `result`
 * message gives exactly one `done` or `error`; a sub-agent's own messages
 * give only its steps.
 *
 * @param billing - How this turn is paid for, recorded with the totals.
 */
export function toAgentEvents(message: SDKMessage, state: ClaudeStreamState, billing: UsageTotals["billing"]): Array<AgentEvent> {
  const events: Array<AgentEvent> = [];
  if (!state.sessionReported && "session_id" in message && typeof message.session_id === "string") {
    state.sessionReported = true;
    events.push({ type: "session", ref: message.session_id });
  }
  switch (message.type) {
    case "rate_limit_event":
      events.push({ type: "usage", provider: "claude", info: message.rate_limit_info });
      break;
    case "assistant":
      events.push(
        ...(message.parent_tool_use_id === null
          ? assistantEvents(message.message.content, state.subagents)
          : subagentStepEvents(message.parent_tool_use_id, message.message.content)),
      );
      break;
    case "user":
      if (message.parent_tool_use_id === null) events.push(...toolResultEvents(message.message.content, state.subagents, message.tool_use_result));
      break;
    case "result":
      if (message.subtype === "success" && !message.is_error) {
        events.push({ type: "done", output: message.result, totals: usageTotals(message, billing), usage: undefined });
      } else {
        // A "success" that is an error (a failed login, say) carries the reason as its result.
        const reason = message.subtype === "success" && message.result.trim() !== "" ? message.result.trim() : message.subtype;
        events.push({ type: "error", message: `Claude run failed: ${reason}`, failure: { code: "run-failed", provider: "claude", reason } });
      }
      break;
  }
  return events;
}
