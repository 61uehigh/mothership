import { z } from "zod";
import { AGENT_KIND_LABELS, AGENT_KINDS, EFFORTS, type AgentKind } from "@/features/sessions/model/AgentEvents";

const roleFields = z.object({
  description: z.string(),
  provider: z.enum(AGENT_KINDS),
  model: z.string().optional(),
  effort: z.enum(EFFORTS).optional(),
  mcp: z.array(z.string()).optional(),
  /** Work in a separate git worktree so changes can be reviewed before merging. */
  worktree: z.boolean().default(false),
});

/**
 * mothership once had OpenAI agents (GPT through the API key). A role still
 * saved for them, e.g. in your own copy of `roles.yaml`, runs on Codex
 * instead, without the OpenAI model name, which Codex may not know.
 */
const roleSchema = z.preprocess(
  (raw) => (typeof raw === "object" && raw !== null && "provider" in raw && raw.provider === "openai" ? { ...raw, provider: "codex", model: undefined } : raw),
  roleFields,
);

/**
 * ### rolesConfigSchema
 *
 * The shape of `config/roles.yaml`.
 */
export const rolesConfigSchema = z.object({ roles: z.record(z.string(), roleSchema) });

/**
 * ### Role
 *
 * A preset from `config/roles.yaml`.
 */
export type Role = { name: string } & z.infer<typeof roleFields>;

/**
 * ### ProviderReadiness
 *
 * Whether each backend can run on this Mac, and if not, why; a backend
 * missing here counts as ready.
 */
export type ProviderReadiness = Partial<Record<AgentKind, { ready: boolean; detail: string }>>;

/**
 * ### providerRefusal
 *
 * Why a sub-agent can't be created on `provider`, naming the backends that
 * can run, so the agent asking can pick another role or provider.
 *
 * @returns `undefined` when `provider` is ready.
 */
export function providerRefusal(provider: AgentKind, readiness: ProviderReadiness): string | undefined {
  const check = readiness[provider];
  if (check === undefined || check.ready) return undefined;
  const ready = AGENT_KINDS.filter((kind) => readiness[kind]?.ready !== false);
  const alternatives = ready.length === 0 ? "No backend is set up, so ask the human." : `Pick a role or provider that runs on ${ready.map((kind) => AGENT_KIND_LABELS[kind]).join(" or ")}.`;
  return `${AGENT_KIND_LABELS[provider]} agents can't run here: ${check.detail} ${alternatives}`;
}

/**
 * ### RoleForAgents
 *
 * A role as `list_roles` shows it to agents: with whether its provider can
 * run now, and why not.
 */
export type RoleForAgents = Role & { available: boolean; unavailableReason?: string };

/**
 * ### rolesForAgents
 *
 * Marks each role whose provider can't run, so a lead does not hand work to
 * an agent that would fail at once.
 */
export function rolesForAgents(roles: Array<Role>, readiness: ProviderReadiness): Array<RoleForAgents> {
  return roles.map((role) => {
    const refusal = providerRefusal(role.provider, readiness);
    return refusal === undefined ? { ...role, available: true } : { ...role, available: false, unavailableReason: refusal };
  });
}
