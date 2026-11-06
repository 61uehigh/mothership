"use client";

import { AGENT_KINDS, AGENT_CAPABILITIES, AGENT_KIND_LABELS, kindsWith, namesOf } from "@/features/sessions/model/AgentEvents";
import type { Role } from "@/features/sessions/model/Roles";
import { FIELD_CLASS, nameFromTask } from "@/features/sessions/ui/newAgentFields";
import type { NewAgentForm } from "@/features/sessions/ui/useNewAgentForm";

/**
 * ### NewAgentOptions
 *
 * The New session dialog's folded "More options": role, name, worktree,
 * compare run and its agents, and git access (who runs the session is picked
 * on the dialog's face, in `LeadPicker`). Its summary line shows what is
 * picked while folded.
 */
export function NewAgentOptions({
  form,
  roles,
  comparing,
  notARepo,
}: {
  form: NewAgentForm;
  roles: Array<Role>;
  /** A compare run is on and possible. */
  comparing: boolean;
  /** The folder was checked and is not in a git repository. */
  notARepo: boolean;
}) {
  const { role, provider, worktree, allowGit, attempts, mcp } = form;
  const { gitAccess } = AGENT_CAPABILITIES[provider];
  return (
    <details className="group rounded-md border border-zinc-200 dark:border-zinc-700">
      <summary className="cursor-pointer list-none px-2.5 py-1.5 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
        <span className="mr-1 inline-block transition-transform group-open:rotate-90" aria-hidden>
          ›
        </span>
        More options{" "}
        <span className="text-zinc-400">· {comparing ? "compare run" : `${role === "" ? "no role" : role}${worktree ? ", worktree" : ""}${allowGit && gitAccess ? ", git" : ""}`}</span>
      </summary>
      <div className="flex flex-col gap-3 border-t border-zinc-200 p-2.5 dark:border-zinc-700">
        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          Role
          <select className={FIELD_CLASS} value={role} onChange={(e) => form.applyRole(e.target.value, roles)}>
            <option value="">None</option>
            {roles.map((r) => (
              <option key={r.name} value={r.name}>
                {r.name} — {r.description}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          Name
          <input
            className={FIELD_CLASS}
            placeholder={nameFromTask(form.initialMessage) || "Taken from the task"}
            value={form.name}
            onChange={(e) => form.setName(e.target.value)}
          />
        </label>

        <div className="flex flex-col gap-1.5 rounded-md border border-zinc-200 p-2.5 text-sm dark:border-zinc-700">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={!notARepo && (worktree || comparing)}
              disabled={comparing || notARepo}
              onChange={(e) => form.setWorktree(e.target.checked)}
            />
            Work in a separate worktree <span className="text-xs text-zinc-500">Review changes before merging</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={comparing} disabled={notARepo} onChange={(e) => form.setCompare(e.target.checked)} />
            Compare run <span className="text-xs text-zinc-500">Give the same task to several agents, then pick one to merge</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={allowGit && gitAccess && !comparing}
              disabled={comparing || !gitAccess}
              onChange={(e) => form.setAllowGit(e.target.checked)}
            />
            Allow git{" "}
            <span className="text-xs text-zinc-500">
              {gitAccess ? "Commits, history edits, fetch; every push asks you first" : `${namesOf(kindsWith("gitAccess"))} sessions only; ${AGENT_KIND_LABELS[provider]} can't commit or push`}
            </span>
          </label>
          {comparing && (
            <div className="flex gap-3 pl-6 text-xs">
              {AGENT_KINDS.map((k) => (
                <label key={k} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={attempts.includes(k)}
                    onChange={(e) => form.setAttempts((list) => (e.target.checked ? [...list, k] : list.filter((x) => x !== k)))}
                  />
                  {k}
                </label>
              ))}
            </div>
          )}
        </div>

        <p className="text-xs text-zinc-500">MCP: {mcp === undefined ? "All enabled servers" : mcp.length === 0 ? "None" : mcp.join(", ")}</p>
      </div>
    </details>
  );
}
