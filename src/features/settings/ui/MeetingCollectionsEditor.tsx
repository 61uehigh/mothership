"use client";

import { ChevronRight, Folder, Plus, X } from "lucide-react";
import { useState } from "react";
import { useJson } from "@/ui/useJson";
import { describeSourceProblem, type SourceProblem } from "@/features/settings/model/connectionDiagnosis";
import { toolLoadError } from "@/shell/toolFailureText";
import { toolErrorCodeOf } from "@/features/tools/model/Dashboard";
import { useLocale, useT } from "@/ui/i18n/useT";
import { itemPathTitle, itemTitle, TITLE_PATH_SEPARATOR } from "@/ui/i18n/itemTitle";
import { MEETING_COLLECTIONS_MAX, type MeetingCollection, type NuclinoCollectionChoice } from "@/features/meetings/model/Meetings";
import { listWhileSaving } from "@/features/settings/ui/saveAnswers";

type Choice = NuclinoCollectionChoice & { kind: "workspace" | "collection" };

const BUTTON = "inline-flex items-center gap-1 rounded-md border border-zinc-300 px-2 py-0.5 text-[11px] hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800";

/** One workspace or collection, unfolding to the collections inside it. */
function Node({ choice, chosen, saving, onAdd }: { choice: Choice; chosen: Set<string>; saving: boolean; onAdd: (collection: MeetingCollection) => void }) {
  const t = useT();
  const { locale } = useLocale();
  const [open, setOpen] = useState(false);
  const title = itemTitle(t, choice.title);
  // Raw titles, with an untitled one left empty, so what is saved is worded only when drawn.
  const path = [...choice.path, choice.title];
  const children = useJson<Array<Choice>>(open ? `/api/meetings/collections?parent=${choice.id}&path=${encodeURIComponent(path.join(TITLE_PATH_SEPARATOR))}` : undefined);
  return (
    <li>
      <div className="flex items-center gap-1 rounded-md px-1 py-0.5 hover:bg-zinc-100 dark:hover:bg-zinc-800/70">
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex min-w-0 flex-1 items-center gap-1 text-left text-[13px]">
          <ChevronRight size={12} className={`shrink-0 text-zinc-500 transition-transform ${open ? "rotate-90" : ""}`} aria-hidden />
          <Folder size={12} className="shrink-0 text-zinc-500" aria-hidden />
          <span className="truncate">{title}</span>
          {choice.kind === "workspace" && <span className="shrink-0 text-[11px] text-zinc-500">{t("settings.meetings.workspace")}</span>}
        </button>
        {choice.kind === "collection" && (
          <button
            type="button"
            className={BUTTON}
            disabled={saving || chosen.has(choice.id)}
            onClick={() => onAdd({ id: choice.id, title: path.slice(1).join(TITLE_PATH_SEPARATOR), workspace: choice.workspace })}
          >
            <Plus size={11} aria-hidden />
            {chosen.has(choice.id) ? t("settings.meetings.added") : t("settings.meetings.add")}
          </button>
        )}
      </div>
      {open && (
        <div className="pl-4">
          {children.data === undefined ? (
            <p className="px-1 py-0.5 text-[11px] text-zinc-500">{toolLoadError(t, locale, children.failure, "nuclino") ?? t("settings.meetings.reading")}</p>
          ) : children.data.length === 0 ? (
            <p className="px-1 py-0.5 text-[11px] text-zinc-500">{t("settings.meetings.noneInside")}</p>
          ) : (
            <ul>
              {children.data.map((child) => (
                <Node key={child.id} choice={child} chosen={chosen} saving={saving} onAdd={onAdd} />
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * ### MeetingCollectionsEditor
 *
 * Settings → Workspace → Meeting collections: the Nuclino collections your meeting notes are in.
 * Browse workspaces and collections, add the ones to list; each change
 * saves at once.
 *
 * @param onSave - Saves the whole list; resolves with an error message, if any.
 */
export function MeetingCollectionsEditor({
  collections,
  onSave,
  onFix,
}: {
  collections: Array<MeetingCollection>;
  onSave: (collections: Array<MeetingCollection>) => Promise<string | undefined>;
  /** Opens where Nuclino's failure is fixed: its card in Connections, or Agents when Claude refused the login it is read through. */
  onFix: (fix: NonNullable<SourceProblem["fix"]>) => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const [status, setStatus] = useState<{ message: string; failed: boolean } | undefined>(undefined);
  const [browsing, setBrowsing] = useState(collections.length === 0);
  const roots = useJson<Array<Choice>>(browsing ? "/api/meetings/collections" : undefined);
  const failure = describeSourceProblem("nuclino", roots.error, { code: toolErrorCodeOf(roots.failure?.code) });
  const { fix } = failure;
  const [saving, setSaving] = useState<Array<MeetingCollection> | undefined>(undefined);
  const { shown, locked } = listWhileSaving(saving, collections);
  const chosen = new Set(shown.map((c) => c.id));
  const full = shown.length >= MEETING_COLLECTIONS_MAX;

  async function save(next: Array<MeetingCollection>) {
    setSaving(next);
    const error = await onSave(next);
    setSaving(undefined);
    setStatus({ message: error ?? t("settings.saved"), failed: error !== undefined });
  }

  return (
    <div className="flex flex-col gap-3">
      {shown.length === 0 ? (
        <p className="text-xs text-zinc-500">{t("settings.meetings.none")}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {shown.map((collection) => (
            <li key={collection.id} className="flex items-center gap-2 rounded-md border border-zinc-200 px-2 py-1 text-[13px] dark:border-zinc-800">
              <span className="min-w-0 flex-1 truncate">{itemPathTitle(t, collection.title)}</span>
              <span className="shrink-0 text-[11px] text-zinc-500">{collection.workspace}</span>
              <button
                type="button"
                aria-label={t("settings.meetings.remove", { title: itemPathTitle(t, collection.title) })}
                disabled={locked}
                onClick={() => void save(shown.filter((c) => c.id !== collection.id))}
                className="rounded p-0.5 text-zinc-500 hover:text-zinc-900 disabled:opacity-50 dark:hover:text-zinc-100"
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {browsing ? (
        <div className="flex flex-col gap-1 rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-medium text-zinc-500">Nuclino</span>
            <button type="button" className={BUTTON} onClick={() => setBrowsing(false)}>
              {t("settings.meetings.done")}
            </button>
          </div>
          {roots.data === undefined ? (
            roots.error === undefined ? (
              <p className="px-1 text-[11px] text-zinc-500">{t("settings.meetings.readingWorkspaces")}</p>
            ) : (
              <div className="flex flex-wrap items-center gap-2 px-1 text-[11px]">
                <p title={roots.error} className={failure.problem?.cause === "rate-limited" ? "text-amber-700 dark:text-amber-400" : "text-red-700 dark:text-red-400"}>
                  {toolLoadError(t, locale, roots.failure, "nuclino")}
                </p>
                {fix !== undefined && (
                  <button type="button" className={BUTTON} onClick={() => onFix(fix)}>
                    {fix.page === "agents" ? t("settings.fixInAgents") : t("settings.fixInConnections")}
                  </button>
                )}
              </div>
            )
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {roots.data.map((root) => (
                <Node key={root.id} choice={root} chosen={chosen} saving={locked || full} onAdd={(collection) => void save([...shown, collection])} />
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div>
          <button type="button" className={BUTTON} disabled={full} onClick={() => setBrowsing(true)}>
            <Plus size={11} aria-hidden />
            {t("settings.meetings.addCollection")}
          </button>
        </div>
      )}
      {full && <p className="text-[11px] text-zinc-500">{t("settings.meetings.full", { max: MEETING_COLLECTIONS_MAX })}</p>}
      {status !== undefined && <p className={`text-[11px] ${status.failed ? "text-red-600 dark:text-red-400" : "text-zinc-500"}`}>{status.message}</p>}
    </div>
  );
}
