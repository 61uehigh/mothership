import { randomUUID } from "node:crypto";
import { z } from "zod";
import { parseBody } from "@/app/api/_lib/http";
import { AGENT_KINDS, EFFORTS } from "@/features/sessions/model/AgentEvents";
import type { Agent } from "@/features/sessions/model/Agent";
import { getRuntime } from "@/composition/server";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(60),
  task: z.string().trim().min(1),
  role: z.string().optional(),
  mcp: z.array(z.string()).optional(),
  repo: z.string().trim().min(1).optional(),
  attempts: z
    .array(z.object({ provider: z.enum(AGENT_KINDS), model: z.string().optional(), effort: z.enum(EFFORTS).optional() }))
    .min(2)
    .max(5),
});

/**
 * ### POST
 *
 * Starts the same task on 2–5 agents, each in its own worktree of `repo`,
 * grouped for side-by-side comparison. The human later merges one; the
 * others are discarded.
 *
 * @returns `{ group, agents }`, or 400 for an invalid body or a non-git `repo`.
 */
export async function POST(request: Request): Promise<Response> {
  const body = await parseBody(request, bodySchema);
  if (body instanceof Response) return body;
  const { name, task, role, mcp, repo, attempts } = body;
  const group = randomUUID();
  const runtime = getRuntime();
  const agents: Array<Agent> = [];
  try {
    // Sequential: worktree creation touches the same repository. The task is
    // sent only once every attempt exists, so a failure leaves nothing running.
    for (const [index, attempt] of attempts.entries()) {
      agents.push(
        await runtime.createAgent({
          name: `${name}-${attempt.provider}${attempts.filter((a) => a.provider === attempt.provider).length > 1 ? `-${index + 1}` : ""}`,
          role,
          provider: attempt.provider,
          model: attempt.model,
          effort: attempt.effort,
          parentId: undefined,
          mcp,
          initialMessage: undefined,
          repo,
          worktree: true,
          compareGroup: group,
        }),
      );
    }
    for (const agent of agents) runtime.sendMessage(agent.id, task, undefined);
    return Response.json({ group, agents }, { status: 201 });
  } catch (error) {
    // Roll back the attempts already created (their worktrees and branches).
    for (const agent of agents) await runtime.deleteAgent(agent.id).catch(() => undefined);
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
