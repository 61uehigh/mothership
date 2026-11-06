import { z } from "zod";
import type { CheckResult } from "@/features/settings/model/Settings";
import { AGENT_CAPABILITIES, AGENT_KIND_LABELS, AGENT_KINDS, EFFORTS, type AgentKind, type Effort } from "@/features/sessions/model/AgentEvents";

/**
 * ### leadChoiceSchema
 *
 * Who leads new sessions: a backend with its model and effort (absent: the
 * backend's own default). Saved as Settings → Agents → Default lead.
 */
export const leadChoiceSchema = z.object({
  provider: z.enum(AGENT_KINDS),
  model: z.string().trim().min(1).optional(),
  effort: z.enum(EFFORTS).optional(),
});

/**
 * ### LeadChoice
 *
 * See {@link leadChoiceSchema}.
 */
export type LeadChoice = { provider: AgentKind; model: string | undefined; effort: Effort | undefined };

/**
 * ### LEAD_DEFAULTS
 *
 * What picking a backend in the lead picker starts with: Claude on Opus at
 * high effort, Codex on whatever model and effort its own config says.
 */
export const LEAD_DEFAULTS: Record<AgentKind, LeadChoice> = {
  claude: { provider: "claude", model: "opus", effort: "high" },
  codex: { provider: "codex", model: undefined, effort: undefined },
};

/**
 * ### DEFAULT_LEAD
 *
 * The lead until you choose another: Claude's {@link LEAD_DEFAULTS}.
 */
export const DEFAULT_LEAD: LeadChoice = { provider: "claude", model: "opus", effort: "high" };

/**
 * ### leadDefaults
 *
 * @returns {@link LEAD_DEFAULTS} for `kind`.
 */
export function leadDefaults(kind: AgentKind): LeadChoice {
  return LEAD_DEFAULTS[kind];
}

/**
 * ### sameLead
 *
 * @returns Whether two lead choices run the same backend, model, and effort.
 */
export function sameLead(a: LeadChoice, b: LeadChoice): boolean {
  return a.provider === b.provider && a.model === b.model && a.effort === b.effort;
}

/**
 * ### ModelOption
 *
 * A model the picker offers: the id the backend takes, and its name.
 */
export type ModelOption = { id: string; label: string };

/**
 * ### CLAUDE_LEAD_MODELS
 *
 * Claude Code's model aliases, which always point at the newest of each.
 */
export const CLAUDE_LEAD_MODELS: Array<ModelOption> = [
  { id: "opus", label: "Opus" },
  { id: "sonnet", label: "Sonnet" },
];

/**
 * ### pickLead
 *
 * The lead a new session starts with: your saved choice when its backend is
 * ready, else the first ready backend's defaults, else the saved choice anyway
 * (the picker then says why it can't start).
 *
 * @param ready - Whether each backend can run now; a backend missing here counts as ready (not checked yet).
 */
export function pickLead(saved: LeadChoice, ready: Partial<Record<AgentKind, boolean>>): LeadChoice {
  const isReady = (kind: AgentKind) => ready[kind] !== false;
  if (isReady(saved.provider)) return saved;
  const fallback = AGENT_KINDS.find(isReady);
  return fallback === undefined ? saved : leadDefaults(fallback);
}

/**
 * ### LeadLimit
 *
 * Something a Claude lead can do that another backend can't: delegate to its
 * own sub-agents, commit and push (Allow git), or use claude.ai connectors.
 */
export type LeadLimit = "subagents" | "git" | "connectors";

/**
 * ### leadLimits
 *
 * What `kind` can't do as a lead that a Claude lead can; empty when nothing.
 * The screens word them with `shell/leadLimitText`.
 */
export function leadLimits(kind: AgentKind): Array<LeadLimit> {
  const can = AGENT_CAPABILITIES[kind];
  const limits: Array<LeadLimit> = [];
  if (!can.nativeSubagents) limits.push("subagents");
  if (!can.gitAccess) limits.push("git");
  if (!can.claudeConnectors) limits.push("connectors");
  return limits;
}

/**
 * ### leadLabel
 *
 * @returns Who leads a session, for lists: e.g. "Claude · opus" or "Codex" (its default model).
 */
export function leadLabel(agent: { provider: AgentKind; model: string | undefined }): string {
  return agent.model === undefined ? AGENT_KIND_LABELS[agent.provider] : `${AGENT_KIND_LABELS[agent.provider]} · ${agent.model}`;
}

/**
 * ### LeadOptions
 *
 * What the lead picker offers, as `GET /api/leads` answers it.
 */
export type LeadOptions = {
  /** Your saved lead (Settings → Agents → Default lead). */
  saved: LeadChoice;
  /** Whether each backend that can lead is ready, and if not, why. */
  readiness: Partial<Record<AgentKind, CheckResult>>;
  /** Models to pick from per backend; the backend's default is always offered too. */
  models: Partial<Record<AgentKind, Array<ModelOption>>>;
};

/**
 * ### modelChoices
 *
 * The models offered for `provider`, with `current` added when it is not in
 * the list (a model from a role, or one Codex no longer lists).
 *
 * @param current - The model picked now; `undefined` for the backend's default.
 */
export function modelChoices(provider: AgentKind, options: Pick<LeadOptions, "models"> | undefined, current: string | undefined): Array<ModelOption> {
  const listed = options?.models[provider] ?? [];
  return current === undefined || listed.some((m) => m.id === current) ? listed : [...listed, { id: current, label: current }];
}
