import { z } from "zod";
import { errorResponse, parseBody } from "@/app/api/_lib/http";
import { AGENT_KINDS, EFFORTS } from "@/features/sessions/model/AgentEvents";
import { loadRoles } from "@/features/sessions/server/roles";
import { getRuntime } from "@/composition/server";
import { RuntimeLimitError } from "@/features/sessions/server/AgentRuntime";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list_agents") }),
  z.object({ action: z.literal("list_roles") }),
  z.object({ action: z.literal("get_agent"), agentId: z.string() }),
  z.object({
    action: z.literal("spawn_agent"),
    name: z.string().trim().min(1).max(80),
    role: z.string().optional(),
    provider: z.enum(AGENT_KINDS).optional(),
    model: z.string().optional(),
    effort: z.enum(EFFORTS).optional(),
    task: z.string().trim().min(1),
  }),
  z.object({ action: z.literal("message_agent"), agentId: z.string(), text: z.string().trim().min(1) }),
  z.object({
    action: z.literal("ask_human"),
    question: z.string().trim().min(1),
    options: z.array(z.string().trim().min(1)).max(6).default([]),
  }),
  z.object({ action: z.literal("set_status"), status: z.string().trim().max(120) }),
  z.object({ action: z.literal("add_link"), label: z.string().trim().min(1).max(40), url: z.url({ protocol: /^https?$/ }) }),
]);

function fail(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

/**
 * ### POST
 *
 * Operations an agent performs through its mothership MCP server
 * (`scripts/control-mcp.mjs`). The bearer token identifies the calling agent,
 * so an agent can only act as itself.
 *
 * @returns The action's result as JSON; 401 for an unknown token, 400 for an
 *   invalid request, 409 when a safety limit refuses it.
 */
export async function POST(request: Request): Promise<Response> {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const runtime = getRuntime();
  const self = runtime.agentIdForToken(token);
  if (self === undefined) return fail("Unknown agent token", 401);

  const input = await parseBody(request, actionSchema);
  if (input instanceof Response) return input;

  try {
    switch (input.action) {
      case "list_agents":
        return Response.json({ you: self, agents: runtime.summaries() });
      case "list_roles":
        return Response.json(await loadRoles());
      case "get_agent": {
        const summary = runtime.summary(input.agentId);
        return summary === undefined ? fail(`Unknown agent ${input.agentId}`, 404) : Response.json(summary);
      }
      case "spawn_agent": {
        const role = input.role === undefined ? undefined : (await loadRoles()).find((r) => r.name === input.role);
        if (input.role !== undefined && role === undefined) return fail(`Unknown role ${input.role}; call list_roles`, 400);
        const agent = await runtime.spawn(
          self,
          {
            name: input.name,
            role: role?.name,
            provider: input.provider ?? role?.provider ?? "claude",
            model: input.model ?? role?.model,
            effort: input.effort ?? role?.effort,
            mcp: role?.mcp,
            worktree: role?.worktree ?? false,
          },
          input.task,
        );
        return Response.json({ agentId: agent.id, name: agent.name, provider: agent.provider });
      }
      case "message_agent": {
        const message = runtime.messageFromAgent(self, input.agentId, input.text);
        return Response.json({ messageId: message.id, queued: true });
      }
      case "ask_human": {
        const question = runtime.askHuman(self, input.question, input.options);
        return Response.json({ questionId: question.id, status: question.status });
      }
      case "set_status":
        runtime.updateProfile(self, { statusNote: input.status });
        return Response.json({ ok: true });
      case "add_link":
        runtime.updateProfile(self, { addLink: { label: input.label, url: input.url } });
        return Response.json({ ok: true });
    }
  } catch (error) {
    // Safety limits are 409 for the agent to adjust to; anything else (e.g. an unknown recipient) is its mistake.
    if (error instanceof RuntimeLimitError) return errorResponse(error);
    return fail(error instanceof Error ? error.message : String(error), 400);
  }
}
