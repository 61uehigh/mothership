"use client";

import { useEffect, useState } from "react";
import { errorMessage } from "@/lib/errors";
import { Modal } from "@/ui/Modal";
import { useJson } from "@/ui/useJson";
import type { Tab } from "@/shell/tabs";
import { openSettingsPage } from "@/shell/settingsPage";
import { useWorkbenchActions } from "@/shell/WorkbenchContext";
import type { NewAgentDraft } from "@/features/sessions/model/NewAgentDraft";
import { pickLead, type LeadOptions } from "@/features/sessions/model/Lead";
import { DEFAULT_ROLE, FIELD_CLASS, leadsSession } from "@/features/sessions/ui/newAgentFields";
import { LeadPicker } from "@/features/sessions/ui/LeadPicker";
import { NewAgentOptions } from "@/features/sessions/ui/NewAgentOptions";
import { rememberLead, startSession } from "@/features/sessions/ui/startSession";
import { useNewAgentChoices } from "@/features/sessions/ui/useNewAgentChoices";
import { useNewAgentForm } from "@/features/sessions/ui/useNewAgentForm";
import { useRepoProbe, isNotARepo } from "@/features/sessions/ui/useRepoProbe";
import { WorkingFolderField } from "@/features/sessions/ui/WorkingFolderField";

/**
 * ### NewAgentDialog
 *
 * Starts a session: you give a task and a folder, pick who leads it (Claude
 * or Codex, starting from your default lead), and the lead takes it on,
 * creating whatever sub-agents (with their own providers and models) the
 * work needs. Under More options you can pick another role, work in a
 * worktree, or start a compare run. Esc closes it.
 */
export function NewAgentDialog({
  draft,
  onCreated,
  onClose,
}: {
  draft: NewAgentDraft | undefined;
  /** Called with the tab to show next: the new session, or the comparison. */
  onCreated: (tab: Tab) => void;
  onClose: () => void;
}) {
  const form = useNewAgentForm(draft);
  const { roles, repositories, defaultFolder, error: choicesError } = useNewAgentChoices((list) => form.applyRole(draft?.role ?? DEFAULT_ROLE, list));
  const leadOptions = useJson<LeadOptions>("/api/leads");
  const workbench = useWorkbenchActions();
  const probe = useRepoProbe(form.repo);
  const notARepo = isNotARepo(probe);
  /** A compare run needs a git repository; outside one the box is off whatever it was. */
  const comparing = form.compare && !notARepo;
  const [error, setError] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const lead = leadsSession(form.role);
  const options = leadOptions.data;
  const { takeDefaultLead } = form;
  useEffect(() => {
    if (options === undefined) return;
    const ready = Object.fromEntries(Object.entries(options.readiness).map(([kind, check]) => [kind, check.ready]));
    takeDefaultLead(pickLead(options.saved, ready));
    // Once, when the options arrive; the form keeps its own choice after that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options]);
  const providerNotReady = !comparing && options?.readiness[form.provider]?.ready === false;
  const choice = { provider: form.provider, model: form.model.trim() === "" ? undefined : form.model.trim(), effort: form.effort === "" ? undefined : form.effort };

  async function submit() {
    setSubmitting(true);
    setError(undefined);
    form.rememberRepo(form.repo.trim());
    try {
      const result = await startSession(form, { comparing, notARepo });
      if (!result.ok) setError(result.error);
      else {
        // The lead you started with becomes your default lead (Settings → Agents).
        if (lead && !comparing && options !== undefined) rememberLead(options.saved, choice);
        onCreated(result.data);
      }
    } catch (thrown) {
      // Remembering the folder or opening the new tab can throw; say so here rather than leave an unhandled rejection.
      setError(errorMessage(thrown));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal label="New session" className="items-end justify-center backdrop:bg-black/50 sm:items-center" onClose={onClose}>
      <form
        className="flex max-h-[90dvh] w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-t-xl bg-white p-5 sm:rounded-xl dark:bg-zinc-900"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <h2 className="text-lg font-semibold">New session</h2>

        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          {comparing ? "Task (sent identically to every agent)" : "What should get done?"}
          <textarea
            className={`${FIELD_CLASS} min-h-28`}
            data-autofocus
            placeholder="Describe the goal. The lead plans it, creates the sub-agents it needs, and reports back."
            value={form.initialMessage}
            onChange={(e) => form.setInitialMessage(e.target.value)}
          />
        </label>

        <WorkingFolderField
          repo={form.repo}
          onChange={form.setRepo}
          onError={setError}
          defaultFolder={defaultFolder}
          repositories={repositories}
          probe={probe}
        />

        {!comparing && (
          <LeadPicker
            value={choice}
            onChange={form.pickLead}
            options={options}
            lead={lead}
            onOpenSettings={() => {
              openSettingsPage("agents", () => workbench.open({ kind: "settings" }));
              onClose();
            }}
          />
        )}
        {leadOptions.error !== undefined && <p className="text-xs text-red-600 dark:text-red-400">Couldn&apos;t check which agents are ready: {leadOptions.error}</p>}

        <NewAgentOptions form={form} roles={roles} comparing={comparing} notARepo={notARepo} />

        {choicesError !== undefined && <p className="whitespace-pre-wrap text-xs text-red-600 dark:text-red-400">{choicesError}</p>}
        {error !== undefined && <p className="whitespace-pre-wrap text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" className="rounded-md px-4 py-1.5 text-sm" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || providerNotReady || form.initialMessage.trim() === "" || (comparing && form.attempts.length < 2)}
            className="rounded-md bg-teal-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40"
          >
            {comparing ? `Compare run with ${form.attempts.length} agents` : "Start"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
