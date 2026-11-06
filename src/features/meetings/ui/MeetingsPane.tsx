"use client";

import { SetUpNotice } from "@/shell/SetUpNotice";
import { SECONDARY_BUTTON } from "@/ui/button";
import { toolFailureText, toolLoadError } from "@/shell/toolFailureText";
import { ListTree, ListOrdered, RefreshCw, Sparkles } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { GroupHeader } from "@/ui/GroupHeader";
import { PaneHeader } from "@/shell/PaneHeader";
import { useWorkbench } from "@/shell/workbenchContext";
import { useFormat } from "@/ui/i18n/format";
import { useJson } from "@/ui/useJson";
import { useNow } from "@/ui/useNow";
import { openSettingsPage } from "@/shell/settingsPage";
import { SETTINGS_CHANGED_EVENT } from "@/shell/events";
import { useStoredState } from "@/ui/useStoredState";
import type { MeetingNote, MeetingsView } from "@/features/meetings/model/Meetings";
import { SELECTED_ROW, ROW_HOVER } from "@/ui/selection";
import { useLocale, useT } from "@/ui/i18n/useT";
import { itemPathTitle, itemTitle } from "@/ui/i18n/itemTitle";

const CLOCK_TICK_MS = 30_000;
/** A retry after a rate limit waits this much longer than asked, at random, so open windows don't all retry at once. */
const RETRY_SPREAD_MS = 10_000;
/** Notes shown per collection before "Show more". */
const SHOWN = 8;
/** Notes shown in the merged list before "Show more". */
const SHOWN_MERGED = 20;

/** Notes grouped by collection, or all of them in one list, newest first. */
type Layout = "grouped" | "merged";
const LAYOUT_KEY = "mothership.meetings.layout";
const parseLayout = (raw: string): Layout | undefined => (raw === "grouped" || raw === "merged" ? raw : undefined);

type CollectionView = MeetingsView["collections"][number];

// One list of every collection's notes, newest first; notes without a date go last.
function mergedNotes(collections: Array<CollectionView>): Array<MeetingNote> {
  const seen = new Set<string>();
  const notes = collections.flatMap((c) => c.notes).filter((n) => !seen.has(n.id) && seen.add(n.id));
  const at = (n: MeetingNote) => n.createdAt ?? n.updatedAt ?? -Infinity;
  return notes.sort((a, b) => at(b) - at(a));
}

function NoteRow({
  note,
  collection,
  now,
  selected,
  onOpen,
  onPin,
}: {
  note: MeetingNote;
  /** Shown in the merged list, where rows from every collection mix. */
  collection?: string;
  now: number;
  selected: boolean;
  onOpen: () => void;
  onPin: () => void;
}) {
  const t = useT();
  const { relativeTime } = useFormat();
  const title = itemTitle(t, note.title);
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        onDoubleClick={onPin}
        title={collection === undefined ? title : `${title} · ${collection}`}
        className={`flex w-full items-baseline gap-1.5 rounded-md px-2 py-1 text-left ${selected ? SELECTED_ROW : ROW_HOVER}`}
      >
        <span className="min-w-0 flex-1 truncate text-[13px]">{title}</span>
        {collection !== undefined && <span className="max-w-[40%] shrink-0 truncate text-[11px] text-zinc-500">{collection}</span>}
        {note.summarized && <Sparkles size={10} aria-label={t("meetings.summaryReady")} className="shrink-0 text-violet-500" />}
        {note.createdAt !== undefined && <span className="shrink-0 whitespace-nowrap text-[11px] text-zinc-500">{relativeTime(note.createdAt, now)}</span>}
      </button>
    </li>
  );
}

/**
 * ### MeetingsPane
 *
 * The newest notes from the configured Nuclino collections, grouped by
 * collection or merged into one list, newest first.
 * A click opens Claude's summary of the note in a tab; a sparkle
 * marks notes whose summary is already made.
 */
export function MeetingsPane() {
  const t = useT();
  const { locale } = useLocale();
  const workbench = useWorkbench();
  const [refresh, setRefresh] = useState(0);
  const fetched = useJson<MeetingsView>(refresh === 0 ? "/api/meetings" : `/api/meetings?refresh=1&n=${refresh}`, { keepPrevious: true });
  // Ticks each second while a rate limit counts down.
  const now = useNow(fetched.data?.rateLimitedUntil === undefined ? CLOCK_TICK_MS : 1000);
  const [folded, setFolded] = useState<Array<string>>([]);
  const [expanded, setExpanded] = useState<Array<string>>([]);
  const [layout, setLayout] = useStoredState<Layout>(LAYOUT_KEY, "grouped", parseLayout);
  const [showAllMerged, setShowAllMerged] = useState(false);
  const view = fetched.data;
  // While Nuclino is rate limiting, the list is the one read before; read it again once the limit should be over.
  const { reload } = fetched;
  const limitedUntil = view?.rateLimitedUntil;
  useEffect(() => {
    if (limitedUntil === undefined) return;
    const timer = setTimeout(reload, Math.max(0, limitedUntil - Date.now()) + Math.random() * RETRY_SPREAD_MS);
    return () => clearTimeout(timer);
  }, [limitedUntil, reload]);
  // Collections chosen in Settings → Meetings show without pressing refresh.
  useEffect(() => {
    window.addEventListener(SETTINGS_CHANGED_EVENT, reload);
    return () => window.removeEventListener(SETTINGS_CHANGED_EVENT, reload);
  }, [reload]);
  function openMeetingSettings() {
    openSettingsPage("workspace/meetings", () => workbench.open({ kind: "settings" }));
  }
  const activeId = workbench.active?.tab.kind === "meeting" ? workbench.active.tab.itemId : undefined;
  function noteRow(note: MeetingNote, collection?: string) {
    return (
      <NoteRow
        key={note.id}
        note={note}
        collection={collection}
        now={now}
        selected={note.id === activeId}
        onOpen={() => workbench.open({ kind: "meeting", itemId: note.id, title: note.title }, { preview: true })}
        onPin={() => workbench.open({ kind: "meeting", itemId: note.id, title: note.title })}
      />
    );
  }
  const merged = layout === "merged";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PaneHeader title={t("section.meetings")}>
        <button
          type="button"
          aria-label={t(merged ? "meetings.groupByCollection" : "meetings.showAllNewest")}
          title={t(merged ? "meetings.groupByCollection" : "meetings.showAllNewest")}
          onClick={() => setLayout(merged ? "grouped" : "merged")}
          className="rounded p-1 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          {merged ? <ListTree size={14} /> : <ListOrdered size={14} />}
        </button>
        <button
          type="button"
          aria-label={t("meetings.refresh")}
          title={t("ui.refresh")}
          onClick={() => setRefresh((n) => n + 1)}
          className="rounded p-1 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          <RefreshCw size={14} className={fetched.loading ? "animate-spin" : ""} />
        </button>
      </PaneHeader>
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-3">
        {limitedUntil !== undefined && (
          <p className="px-2 pb-1 text-[11px] text-amber-700 dark:text-amber-400">
            {t("meetings.rateLimited")}{" "}
            {now > 0 && limitedUntil > now ? t("meetings.retryingIn", { seconds: Math.ceil((limitedUntil - now) / 1000) }) : t("meetings.retryingSoon")}
          </p>
        )}
        {view === undefined ? (
          fetched.error === undefined ? (
            <p className="px-2 py-1 text-xs text-zinc-500">{t("meetings.reading")}</p>
          ) : (
            <div className="flex flex-col items-start gap-1.5 px-2 py-1 text-xs">
              <button
                type="button"
                className={SECONDARY_BUTTON}
                onClick={() => openSettingsPage("connections", () => workbench.open({ kind: "settings" }), "nuclino")}
              >
                {t("tools.fixInSettings")}
              </button>
              <p title={fetched.error} className="break-words text-red-700 dark:text-red-400">
                {toolLoadError(t, locale, fetched.failure, "nuclino")}
              </p>
            </div>
          )
        ) : view.collections.length === 0 ? (
          <SetUpNotice title={t("meetings.noCollections")} action={t("meetings.chooseInSettings")} onAction={openMeetingSettings}>
            {t("meetings.pickCollections")}
          </SetUpNotice>
        ) : merged ? (
          <MergedList view={view} shownAll={showAllMerged} onToggleAll={() => setShowAllMerged((all) => !all)} row={noteRow} />
        ) : (
          view.collections.map((collection) => {
            const isFolded = folded.includes(collection.id);
            const all = expanded.includes(collection.id);
            const notes = all ? collection.notes : collection.notes.slice(0, SHOWN);
            return (
              <section key={collection.id} className="mb-1">
                <GroupHeader
                  title={itemPathTitle(t, collection.title)}
                  count={collection.notes.length}
                  tooltip={`${collection.workspace} / ${itemPathTitle(t, collection.title)}`}
                  open={!isFolded}
                  onToggle={() => setFolded((current) => (isFolded ? current.filter((id) => id !== collection.id) : [...current, collection.id]))}
                />
                {!isFolded &&
                  (collection.error !== undefined ? (
                    <p className="truncate px-2 pb-1 text-[11px] text-red-600 dark:text-red-400" title={collection.error.message}>
                      {toolFailureText(t, locale, collection.error, "nuclino")}
                    </p>
                  ) : collection.notes.length === 0 ? (
                    <p className="px-2 pb-1 text-[11px] text-zinc-500">{t("meetings.noNotes")}</p>
                  ) : (
                    <ul>
                      {notes.map((note) => noteRow(note))}
                      {collection.notes.length > SHOWN && (
                        <li>
                          <button
                            type="button"
                            onClick={() => setExpanded((current) => (all ? current.filter((id) => id !== collection.id) : [...current, collection.id]))}
                            className="px-2 py-0.5 text-[11px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                          >
                            {all ? t("meetings.showFewer") : t("meetings.showMore", { count: collection.notes.length - SHOWN })}
                          </button>
                        </li>
                      )}
                    </ul>
                  ))}
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}

function MergedList({
  view,
  shownAll,
  onToggleAll,
  row,
}: {
  view: MeetingsView;
  shownAll: boolean;
  onToggleAll: () => void;
  row: (note: MeetingNote, collection: string) => ReactNode;
}) {
  const t = useT();
  const { locale } = useLocale();
  const titles = new Map(view.collections.map((c) => [c.id, itemPathTitle(t, c.title)]));
  const notes = mergedNotes(view.collections);
  const failed = view.collections.flatMap((c) => (c.error === undefined ? [] : [{ id: c.id, title: c.title, error: c.error }]));
  return (
    <>
      {failed.map((c) => (
        <p key={c.id} className="truncate px-2 pb-1 text-[11px] text-red-600 dark:text-red-400" title={c.error.message}>
          {itemPathTitle(t, c.title)}: {toolFailureText(t, locale, c.error, "nuclino")}
        </p>
      ))}
      {notes.length === 0 ? (
        failed.length === 0 && <p className="px-2 py-1 text-[11px] text-zinc-500">{t("meetings.noNotes")}</p>
      ) : (
        <ul>
          {(shownAll ? notes : notes.slice(0, SHOWN_MERGED)).map((note) => row(note, titles.get(note.collectionId) ?? ""))}
          {notes.length > SHOWN_MERGED && (
            <li>
              <button type="button" onClick={onToggleAll} className="px-2 py-0.5 text-[11px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
                {shownAll ? t("meetings.showFewer") : t("meetings.showMore", { count: notes.length - SHOWN_MERGED })}
              </button>
            </li>
          )}
        </ul>
      )}
    </>
  );
}
