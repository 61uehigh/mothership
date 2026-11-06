import { z } from "zod";

/**
 * ### AGENT_KINDS
 *
 * Every execution backend an agent can run on. Adding a backend means adding
 * a name here and its adapter to `ADAPTERS` in `features/sessions/server/adapters/index.ts`.
 */
export const AGENT_KINDS = ["claude", "codex"] as const;

/**
 * ### AgentKind
 *
 * One of {@link AGENT_KINDS}.
 */
export type AgentKind = (typeof AGENT_KINDS)[number];

/**
 * ### AGENT_KIND_LABELS
 *
 * Each backend's name as the screens show it.
 */
export const AGENT_KIND_LABELS: Record<AgentKind, string> = { claude: "Claude", codex: "Codex" };

/**
 * ### AgentCapabilities
 *
 * What a backend can do beyond running turns, so the runtime and the UI
 * check a capability instead of a backend's name.
 *
 * @property gitAccess - Can be allowed to commit and push (Claude's sandbox asks you before each push).
 * @property claudeConnectors - Can use the claude.ai connectors you connected.
 * @property nativeSubagents - Has its own short-lived sub-agents inside a turn (Claude's Agent tool) besides `spawn_agent`.
 * @property forksImports - An imported session is forked, so the original stays untouched; otherwise the same thread continues.
 */
export type AgentCapabilities = {
  gitAccess: boolean;
  claudeConnectors: boolean;
  nativeSubagents: boolean;
  forksImports: boolean;
};

/**
 * ### AGENT_CAPABILITIES
 *
 * {@link AgentCapabilities} per backend.
 */
export const AGENT_CAPABILITIES: Record<AgentKind, AgentCapabilities> = {
  claude: { gitAccess: true, claudeConnectors: true, nativeSubagents: true, forksImports: true },
  codex: { gitAccess: false, claudeConnectors: false, nativeSubagents: false, forksImports: false },
};

/**
 * ### EFFORTS
 *
 * Reasoning effort levels every backend accepts. Each adapter maps these onto
 * its own setting.
 */
export const EFFORTS = ["low", "medium", "high"] as const;

/**
 * ### Effort
 *
 * One of {@link EFFORTS}.
 */
export type Effort = (typeof EFFORTS)[number];

/**
 * ### UsageTotals
 *
 * Tokens and estimated cost (USD at API prices) across every model call,
 * sub-agents included, and how the provider was paid for.
 */
export type UsageTotals = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
  /** `subscription`: a Claude login, so the cost is only an estimate; `api`: an API key, billed at that cost. */
  billing: "subscription" | "api";
};

/**
 * ### TurnUsage
 *
 * What one turn used. See {@link UsageTotals}.
 */
export type TurnUsage = UsageTotals;

/**
 * ### AgentEvent
 *
 * A provider-neutral progress event. Each adapter translates its SDK's native
 * stream into this shape so the UI never branches on provider.
 */
export type AgentEvent =
  /** The provider's conversation id; store it and pass it back to continue. */
  | { type: "session"; ref: string }
  /** Subscription limits the provider reported; shape is provider-specific. */
  | { type: "usage"; provider: AgentKind; info: unknown }
  | { type: "text"; text: string }
  /**
   * A tool call. `detail` is the input (JSON for most tools, the command for
   * a shell). `id` ties it to a later `tool_result`; adapters that learn the
   * result together with the call attach it as `result` instead.
   */
  | { type: "tool"; name: string; detail: string; id?: string; result?: ToolResult }
  /** What a tool call (see `tool`) returned, for providers that report it separately. */
  | ({ type: "tool_result"; id: string } & ToolResult)
  | {
      type: "done";
      output: string;
      /** The session's running totals after this turn, as the provider reports them (Claude only). */
      totals: UsageTotals | undefined;
      /**
       * What this turn alone used: `totals` minus the previous turn's. Missing when
       * unknown: other providers, older turns, or the first turn of a session
       * resumed from outside mothership.
       */
      usage: TurnUsage | undefined;
    }
  /**
   * A sub-agent the provider ran inside this turn on its own (Claude's Agent
   * tool), as opposed to one created through mothership's `spawn_agent`.
   * mothership only reads these: `start` when it is created, `step` for each
   * tool it uses, `end` with its report.
   */
  | NativeSubagentEvent
  | { type: "error"; message: string };

/**
 * ### ToolResult
 *
 * A tool call's output, cut to {@link TOOL_OUTPUT_MAX} characters.
 */
export type ToolResult = { output: string; failed: boolean };

/**
 * ### TOOL_OUTPUT_MAX
 *
 * Longest tool output kept in the event log; the rest is cut with a note.
 */
export const TOOL_OUTPUT_MAX = 4000;

/**
 * ### clipToolOutput
 *
 * @returns `text` trimmed and cut to {@link TOOL_OUTPUT_MAX} characters.
 */
export function clipToolOutput(text: string): string {
  const trimmed = text.trim();
  return trimmed.length <= TOOL_OUTPUT_MAX ? trimmed : `${trimmed.slice(0, TOOL_OUTPUT_MAX)}\n… (${trimmed.length - TOOL_OUTPUT_MAX} more characters)`;
}

/**
 * ### NativeSubagentEvent
 *
 * See {@link AgentEvent}. `id` is the tool call that created the sub-agent and
 * ties its `start`, `step`, and `end` events together.
 */
export type NativeSubagentEvent =
  | { type: "subagent"; phase: "start"; id: string; description: string; kind: string; model: string | undefined }
  | { type: "subagent"; phase: "step"; id: string; tool: string }
  | { type: "subagent"; phase: "end"; id: string; output: string; failed: boolean };

/**
 * ### kindsWith
 *
 * @returns The backends that have `capability`, in {@link AGENT_KINDS} order.
 */
export function kindsWith(capability: keyof AgentCapabilities): Array<AgentKind> {
  return AGENT_KINDS.filter((kind) => AGENT_CAPABILITIES[kind][capability]);
}

/**
 * ### namesOf
 *
 * @returns The backends' names joined for a sentence, e.g. "Claude" or "Claude and Codex".
 */
export function namesOf(kinds: ReadonlyArray<AgentKind>): string {
  const names = kinds.map((kind) => AGENT_KIND_LABELS[kind]);
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * ### compareAttemptSchema
 *
 * One attempt of a compare run: a backend with its model and effort.
 */
export const compareAttemptSchema = z.object({
  provider: z.enum(AGENT_KINDS),
  model: z.string().optional(),
  effort: z.enum(EFFORTS).optional(),
});
