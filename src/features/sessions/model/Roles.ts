import { z } from "zod";
import { AGENT_KINDS, EFFORTS } from "@/features/sessions/model/AgentEvents";

const roleSchema = z.object({
  description: z.string(),
  provider: z.enum(AGENT_KINDS),
  model: z.string().optional(),
  effort: z.enum(EFFORTS).optional(),
  mcp: z.array(z.string()).optional(),
  /** Work in a separate git worktree so changes can be reviewed before merging. */
  worktree: z.boolean().default(false),
});

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
export type Role = { name: string } & z.infer<typeof roleSchema>;
