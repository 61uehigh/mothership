import { fetchJson, jsonRequest, type ApiResult } from "@/ui/useJson";
import type { Tab } from "@/shell/tabs";
import type { Agent } from "@/features/sessions/model/Agent";
import { nameFromTask } from "@/features/sessions/ui/newAgentFields";
import type { NewAgentForm } from "@/features/sessions/ui/useNewAgentForm";
import { AGENT_CAPABILITIES } from "@/features/sessions/model/AgentEvents";
import { sameLead, type LeadChoice } from "@/features/sessions/model/Lead";
import { reportFailure } from "@/ui/notices";

/**
 * ### startSession
 *
 * Starts what the New session dialog describes: a compare run when `comparing`,
 * else one session. Empty fields are sent as absent, and an empty name is
 * taken from the task.
 *
 * @param notARepo - The folder was checked and is not in a git repository, so no worktree is asked for.
 * @returns The tab to show next: the comparison, or the new session.
 */
export async function startSession(
  form: Pick<NewAgentForm, "repo" | "name" | "initialMessage" | "role" | "mcp" | "attempts" | "effort" | "provider" | "model" | "worktree" | "allowGit">,
  { comparing, notARepo }: { comparing: boolean; notARepo: boolean },
): Promise<ApiResult<Tab>> {
  const { repo, name, initialMessage, role, mcp, attempts, effort, provider, model, worktree, allowGit } = form;
  const repoValue = repo.trim() === "" ? undefined : repo.trim();
  // An empty name is taken from the task, so the task is all you have to write.
  const sessionName = name.trim() !== "" ? name.trim() : nameFromTask(initialMessage);
  // Worktrees and compare runs need a git repository; a box shown disabled must not still be sent as on.
  const result = comparing
    ? await fetchJson<{ group: string }>(
        "/api/compare",
        jsonRequest("POST", {
          name: sessionName,
          task: initialMessage,
          role: role === "" ? undefined : role,
          mcp,
          repo: repoValue,
          attempts: attempts.map((p) => ({ provider: p, effort: effort === "" ? undefined : effort })),
        }),
      )
    : await fetchJson<Agent>(
        "/api/agents",
        jsonRequest("POST", {
          name: sessionName,
          provider,
          role: role === "" ? undefined : role,
          model: model.trim() === "" ? undefined : model.trim(),
          effort: effort === "" ? undefined : effort,
          parentId: undefined,
          mcp,
          initialMessage: initialMessage.trim() === "" ? undefined : initialMessage,
          repo: repoValue,
          worktree: worktree && !notARepo,
          allowGit: allowGit && AGENT_CAPABILITIES[provider].gitAccess,
        }),
      );
  if (!result.ok) return result;
  return { ok: true, data: "group" in result.data ? { kind: "compare", group: result.data.group } : { kind: "session", agentId: result.data.id } };
}

/**
 * ### rememberLead
 *
 * Saves `choice` as your default lead when it differs from `saved`, so the
 * next New session dialog (and the sessions mothership starts on its own)
 * begins with it. A failure shows as a notice; the session has started anyway.
 */
export function rememberLead(saved: LeadChoice, choice: LeadChoice): void {
  if (sameLead(saved, choice)) return;
  void fetchJson("/api/settings", jsonRequest("PATCH", { lead: choice })).then((result) => reportFailure("Couldn't remember your lead choice", result));
}
