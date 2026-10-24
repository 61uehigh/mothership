import type { AgentKind } from "@/features/sessions/model/AgentEvents";
import type { AgentAdapter } from "@/features/sessions/server/adapters/AgentAdapter";
import { claudeAdapter } from "@/features/sessions/server/adapters/ClaudeAdapter";
import { codexAdapter } from "@/features/sessions/server/adapters/CodexAdapter";
import { openaiAdapter } from "@/features/sessions/server/adapters/OpenAIAdapter";

/**
 * ### ADAPTERS
 *
 * The adapter for every {@link AgentKind}. The `Record` type makes adding a
 * kind to `AGENT_KINDS` without an adapter here a type error.
 */
export const ADAPTERS: Record<AgentKind, AgentAdapter> = {
  claude: claudeAdapter,
  codex: codexAdapter,
  openai: openaiAdapter,
};
