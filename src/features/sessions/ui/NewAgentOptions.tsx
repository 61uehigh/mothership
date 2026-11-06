"use client";

import { AGENT_KINDS, AGENT_CAPABILITIES, AGENT_KIND_LABELS, kindsWith, namesOf } from "@/features/sessions/model/AgentEvents";
import type { Role } from "@/features/sessions/model/Roles";
import { FIELD_CLASS, nameFromTask, sessionNameMax } from "@/features/sessions/ui/newAgentFields";
import type { NewAgentForm } from "@/features/sessions/ui/useNewAgentForm";
import { useT } from "@/ui/i18n/useT";

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
  const t = useT();
  const { role, provider, worktree, allowGit, attempts, mcp } = form;
  const { gitAccess, asksBeforePush } = AGENT_CAPABILITIES[provider];
  const picked = comparing
    ? t("sessions.new.summaryCompare")
    : [role === "" ? t("sessions.new.noRole") : role, worktree ? t("sessions.common.worktree") : undefined, allowGit && gitAccess ? "git" : undefined]
        .filter(Boolean)
        .join(", ");
  return (
    <details className="group rounded-md border border-zinc-200 dark:border-zinc-700">
      <summary className="cursor-pointer list-none px-2.5 py-1.5 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
        <span className="mr-1 inline-block transition-transform group-open:rotate-90" aria-hidden>
          ›
        </span>
        {t("sessions.new.moreOptions")} <span className="text-zinc-400">· {picked}</span>
      </summary>
      <div className="flex flex-col gap-3 border-t border-zinc-200 p-2.5 dark:border-zinc-700">
        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          {t("sessions.common.role")}
          <select className={FIELD_CLASS} value={role} onChange={(e) => form.applyRole(e.target.value, roles)}>
            <option value="">{t("sessions.common.none")}</option>
            {roles.map((r) => (
              <option key={r.name} value={r.name}>
                {r.name} — {r.description}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          {t("sessions.new.name")}
          <input
            className={FIELD_CLASS}
            placeholder={nameFromTask(form.initialMessage) || t("sessions.new.namePlaceholder")}
            // A name typed before ticking Compare run shows cut to what will be sent.
            value={form.name.slice(0, sessionNameMax(comparing))}
            maxLength={sessionNameMax(comparing)}
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
            {t("sessions.new.worktree")} <span className="text-xs text-zinc-500">{t("sessions.new.worktreeNote")}</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={comparing} disabled={notARepo} onChange={(e) => form.setCompare(e.target.checked)} />
            {t("sessions.common.compareRun")} <span className="text-xs text-zinc-500">{t("sessions.new.compareNote")}</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={allowGit && gitAccess && !comparing}
              disabled={comparing || !gitAccess}
              onChange={(e) => form.setAllowGit(e.target.checked)}
            />
            {t("sessions.common.allowGit")}{" "}
            <span className="text-xs text-zinc-500">
              {gitAccess
                ? t(asksBeforePush ? "sessions.common.gitAccessNote" : "sessions.common.gitAccessNoteUnasked")
                : t("sessions.new.gitUnavailable", { kinds: namesOf(kindsWith("gitAccess")), provider: AGENT_KIND_LABELS[provider] })}
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

        <p className="text-xs text-zinc-500">{t("sessions.new.mcp", { servers: mcp === undefined ? t("sessions.new.mcpAll") : mcp.length === 0 ? t("sessions.common.none") : mcp.join(", ") })}</p>
      </div>
    </details>
  );
}
