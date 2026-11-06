"use client";

import { ArrowDownWideNarrow, Bot, CalendarDays, CheckCheck, CircleAlert, Layers, Mail, MailOpen, RefreshCw, Sparkles } from "lucide-react";
import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { GroupHeader } from "@/ui/GroupHeader";
import { PaneHeader } from "@/shell/PaneHeader";
import { openSettingsPage } from "@/shell/settingsPage";
import { describeSourceProblem } from "@/features/settings/model/connectionDiagnosis";
import { sourceProblemLabel } from "@/shell/connectionProblemText";
import { unavailableText } from "@/shell/unavailableText";
import { useWorkbenchActions } from "@/shell/workbenchContext";
import { GitHubIcon, GmailIcon, LinearIcon, SlackIcon, type BrandIconProps } from "@/ui/brandIcons";
import { ICON_BUTTON } from "@/ui/iconButtons";
import { fetchJson, jsonRequest, useJson } from "@/ui/useJson";
import { reportFailure } from "@/ui/notices";
import { useNow } from "@/ui/useNow";
import { usePageVisible } from "@/ui/usePageVisible";
import { useStoredState } from "@/ui/useStoredState";
import { Message } from "@/ui/Message";
import { ROW_HOVER } from "@/ui/selection";
import { inboxGroup, INBOX_VIEWS, newestFirst, readMarkFor, type InboxGroup, type InboxItem, type InboxListView, type InboxSource, type InboxView } from "@/features/inbox/model/Inbox";
import type { MessageKey } from "@/ui/i18n/messages";
import { useFormat } from "@/ui/i18n/format";
import type { Translate } from "@/ui/i18n/translate";
import { useLocale, useT } from "@/ui/i18n/useT";
import { apiErrorText } from "@/ui/i18n/apiErrors";
import { itemTitle } from "@/ui/i18n/itemTitle";
import { isClaudeLoginFailure } from "@/shell/claudeLogin";
import { ClaudeLoginNote } from "@/shell/ClaudeLoginNote";
import { inboxReasonText } from "@/shell/inboxReasonText";

const CLOCK_TICK_MS = 30_000;
/** While Claude reviews in the background, look again this often. */
const REVIEW_POLL_MS = 5_000;

// A new key with the newest-first default, so a grouped view picked before it starts over once.
const VIEW_KEY = "mothership.inbox.list";
const parseView = (raw: string): InboxListView | undefined => INBOX_VIEWS.find((view) => view === raw);
const UNREAD_ONLY_KEY = "mothership.inbox.unreadOnly";
const parseFlag = (raw: string): boolean | undefined => (raw === "true" ? true : raw === "false" ? false : undefined);

const GROUPS: Array<{ group: InboxGroup; label: Extract<MessageKey, `inbox.group.${string}`> }> = [
  { group: "today", label: "inbox.group.needsYou" },
  { group: "week", label: "inbox.group.soon" },
  { group: "month", label: "inbox.group.later" },
  { group: "older", label: "inbox.group.older" },
];

/** The 1st of this month at 00:00 on this computer, until the server says when it is in the dashboard's zone. */
function startOfMonth(now: number): number {
  const date = new Date(now);
  return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
}

/** How each source looks in the pane: its icon and its name (product names as they are, the rest in the chosen language). */
const SOURCE_LOOK: Record<InboxSource, { icon: ComponentType<BrandIconProps>; name: (t: Translate) => string }> = {
  agent: { icon: Bot, name: (t) => t("inbox.source.agents") },
  github: { icon: GitHubIcon, name: () => "GitHub" },
  slack: { icon: SlackIcon, name: () => "Slack" },
  calendar: { icon: CalendarDays, name: (t) => t("inbox.source.calendar") },
  linear: { icon: LinearIcon, name: () => "Linear" },
  gmail: { icon: GmailIcon, name: () => "Gmail" },
};
const sourceLabel = (source: InboxSource, t: Translate): string => SOURCE_LOOK[source].name(t);

/** Sent with a newer `InboxView` (after a read mark or Claude's review), so the sidebar and a full-size Inbox tab agree. */
const INBOX_UPDATED_EVENT = "mothership:inbox-updated";

function shareView(view: InboxView): void {
  window.dispatchEvent(new CustomEvent<InboxView>(INBOX_UPDATED_EVENT, { detail: view }));
}

function Row({ item, now, showAction, onOpen, onToggleRead }: { item: InboxItem; now: number; showAction: boolean; onOpen: () => void; onToggleRead: () => void }) {
  const t = useT();
  const { relativeTime } = useFormat();
  const Icon = SOURCE_LOOK[item.source].icon;
  const reason = inboxReasonText(t, item);
  const subtitle = item.count === undefined ? item.subtitle : [t("inbox.messages", { count: item.count }), item.subtitle].filter(Boolean).join(" · ");
  return (
    <li className="group relative">
      <button type="button" onClick={onOpen} className={`flex w-full items-start gap-1.5 rounded-md py-1.5 pl-1 pr-2 text-left ${ROW_HOVER}`}>
        {/* Always takes its width, so marking read never moves the row's text. */}
        <span aria-hidden className={`mt-[7px] size-1.5 shrink-0 rounded-full ${item.unread ? "bg-teal-500" : ""}`} />
        <Icon size={13} aria-label={sourceLabel(item.source, t)} className="mt-0.5 shrink-0 text-zinc-500" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className={`truncate text-[13px] ${item.unread ? "text-zinc-950 dark:text-zinc-50" : "text-zinc-600 dark:text-zinc-400"}`}>
            {item.unread && <span className="sr-only">{t("inbox.unreadPrefix")}</span>}
            {itemTitle(t, item.title)}
          </span>
          <span className="flex gap-1 truncate text-[11px] text-zinc-500">
            {showAction && item.needsAction && <CircleAlert size={11} aria-label={t("inbox.waitingOnYou")} className="mt-px shrink-0 text-red-600 dark:text-red-400" />}
            <span className={item.movedBy === "claude" ? "text-violet-600 dark:text-violet-400" : ""} title={reason}>
              {item.movedBy === "claude" && <Sparkles size={10} aria-label={t("inbox.movedByClaude")} className="mr-0.5 inline align-[-1px]" />}
              {reason}
            </span>
            {subtitle !== undefined && <span className="truncate">· {subtitle}</span>}
          </span>
        </span>
        {item.at !== undefined && (
          <span className="shrink-0 whitespace-nowrap text-[11px] text-zinc-500 group-focus-within:opacity-0 group-hover:opacity-0">{relativeTime(item.at, now)}</span>
        )}
      </button>
      {/* Over the time, which hides on hover: the row keeps its height. */}
      <button
        type="button"
        aria-label={item.unread ? t("inbox.markRead") : t("inbox.markUnread")}
        title={item.unread ? t("inbox.markRead") : t("inbox.markUnread")}
        onClick={onToggleRead}
        className={`absolute right-1 top-1 opacity-0 focus-visible:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100 ${ICON_BUTTON}`}
      >
        {item.unread ? <MailOpen size={12} /> : <Mail size={12} />}
      </button>
    </li>
  );
}

/**
 * One list, newest first, with what needs you today pinned above the rest
 * under its own heading; without any such item it is just the list.
 */
function NewestList({ items, row }: { items: Array<InboxItem>; row: (item: InboxItem) => ReactNode }) {
  const t = useT();
  const pinned = items.filter((item) => item.bucket === "today");
  if (pinned.length === 0) return <ul>{items.map(row)}</ul>;
  const rest = items.filter((item) => item.bucket !== "today");
  return (
    <>
      <section className="mb-1">
        <GroupHeader title={t("inbox.group.needsYou")} count={pinned.length} />
        <ul>{pinned.map(row)}</ul>
      </section>
      {rest.length > 0 && (
        <section>
          <GroupHeader title={t("inbox.everythingElse")} count={rest.length} />
          <ul>{rest.map(row)}</ul>
        </section>
      )}
    </>
  );
}

/**
 * ### InboxPane
 *
 * What needs you, from agents, GitHub, Slack, your calendar, Linear, and Gmail, grouped by how soon
 * it needs you: Needs you (today), Soon (this week), and Later, by your rules
 * (Settings → Workspace → Inbox rules); Later items untouched since before this
 * month fold under Older. The groups are priorities, not dates, so each item still shows its own time. Each item says
 * why it is there; once a day Claude moves the ones the rules seem to have
 * sorted wrongly (marked with a sparkle). By default it is one list, newest
 * first, with what needs you today pinned above everything else and things
 * waiting on you marked red; the header switches to the grouped view. It tracks
 * what you have read (opening an item reads it), with an unread count that
 * also filters to unread only, and Mark all as read.
 */
export function InboxPane() {
  const t = useT();
  const { locale } = useLocale();
  const { relativeTime } = useFormat();
  const workbench = useWorkbenchActions();
  const now = useNow(CLOCK_TICK_MS);
  // One URL, so a refresh keeps the list (and your scroll) on screen while it reloads.
  const fetched = useJson<InboxView>("/api/inbox", { refreshOnReload: true });
  const visible = usePageVisible();
  // A newer view than the fetch: after Claude's review or a read mark.
  const [latest, setLatest] = useState<InboxView | undefined>(undefined);
  const [reviewState, setReviewState] = useState<{ busy: boolean; error: string | undefined; loginExpired: boolean }>({ busy: false, error: undefined, loginExpired: false });
  // Older starts folded: it is what has waited longest, not what needs you now.
  const [folded, setFolded] = useState<Array<InboxGroup>>(["older"]);
  const [listView, setListView] = useStoredState<InboxListView>(VIEW_KEY, "newest", parseView);
  const [unreadOnly, setUnreadOnly] = useStoredState<boolean>(UNREAD_ONLY_KEY, false, parseFlag);
  // Read marks shown before the server confirms them, by read key.
  const [marking, setMarking] = useState<Record<string, boolean>>({});
  const view = latest ?? fetched.data;
  const { reload } = fetched;
  // A Later item untouched since before this month began is Older.
  const monthStart = view?.monthStart ?? startOfMonth(now);

  // A background review finishes on its own; pick up its moves when it does. Read through the
  // server's cache: a fresh load here would call every outside tool every few seconds.
  useEffect(() => {
    if (view?.reviewing !== true || !visible) return;
    const timer = setInterval(() => {
      void fetchJson<InboxView>("/api/inbox").then((result) => {
        if (result.ok) setLatest(result.data);
      });
    }, REVIEW_POLL_MS);
    return () => clearInterval(timer);
  }, [view?.reviewing, visible]);

  useEffect(() => {
    const take = (event: Event) => setLatest((event as CustomEvent<InboxView>).detail);
    window.addEventListener(INBOX_UPDATED_EVENT, take);
    return () => window.removeEventListener(INBOX_UPDATED_EVENT, take);
  }, []);

  async function review() {
    setReviewState({ busy: true, error: undefined, loginExpired: false });
    const result = await fetchJson<InboxView>("/api/inbox/review", { method: "POST" });
    if (result.ok) shareView(result.data);
    setReviewState({ busy: false, error: result.ok ? undefined : result.error, loginExpired: !result.ok && isClaudeLoginFailure(result) });
  }

  async function mark({ keys, linearIds }: { keys: Array<string>; linearIds: Array<string> }, read: boolean) {
    if (keys.length === 0) return;
    setMarking((current) => ({ ...current, ...Object.fromEntries(keys.map((key) => [key, !read])) }));
    const result = await fetchJson<InboxView>("/api/inbox/read", jsonRequest("POST", { keys, read, linearIds }));
    if (reportFailure(t("inbox.markFailed"), result)) shareView(result.data);
    setMarking((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !keys.includes(key))));
  }

  function open(item: InboxItem) {
    // Opening reads it in Linear too, as Mark as read and Mark all as read do.
    const read = readMarkFor(item, true);
    if (item.unread || read.linearIds.length > 0) void mark(read, true);
    if (item.open.kind === "url") window.open(item.open.url, "_blank", "noopener");
    else workbench.open(item.open, { preview: true });
  }

  const items = (view?.items ?? []).filter((item) => item.bucket !== "hidden").map((item) => ({ ...item, unread: marking[item.readKey] ?? item.unread }));
  const unread = items.filter((item) => item.unread);
  const shown = unreadOnly ? unread : items;
  const empty = unreadOnly ? t("inbox.nothingUnread") : t("inbox.nothing");
  const row = (item: InboxItem) => (
    <Row key={item.id} item={item} now={now} showAction={listView === "newest"} onOpen={() => open(item)} onToggleRead={() => void mark(readMarkFor(item, item.unread), item.unread)} />
  );

  // A review you started reports its own failure; otherwise the background review's, if it failed.
  const background = reviewState.error === undefined ? view?.reviewError : undefined;
  const reviewNote = reviewState.error ?? (background === undefined ? undefined : (apiErrorText(background.code, locale, background.params) ?? background.message));
  const reviewLoginExpired = background === undefined ? reviewState.loginExpired : background.code === "claude-login";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PaneHeader
        title={t("section.inbox")}
        count={
          view === undefined
            ? undefined
            : {
                value: unread.length,
                label: t("inbox.unread"),
                pressed: unreadOnly,
                onClick: () => setUnreadOnly(!unreadOnly),
                title: t("inbox.unreadTitle", {
                  count: unread.length,
                  state: unreadOnly ? t("inbox.showingUnreadOnly") : t("inbox.clickForUnread"),
                  note: t("inbox.readNote"),
                }),
              }
        }
      >
        <button
          type="button"
          aria-label={listView === "urgency" ? t("inbox.showNewest") : t("inbox.groupByPriority")}
          title={listView === "urgency" ? t("inbox.groupedTitle") : t("inbox.newestTitle")}
          onClick={() => setListView(listView === "urgency" ? "newest" : "urgency")}
          className={ICON_BUTTON}
        >
          {listView === "urgency" ? <Layers size={14} /> : <ArrowDownWideNarrow size={14} />}
        </button>
        <button
          type="button"
          aria-label={t("inbox.markAllRead")}
          title={t("inbox.markAllRead")}
          disabled={unread.length === 0}
          onClick={() =>
            void mark({ keys: unread.map((item) => item.readKey), linearIds: items.flatMap((item) => readMarkFor(item, true).linearIds) }, true)
          }
          className={ICON_BUTTON}
        >
          <CheckCheck size={14} />
        </button>
        <button
          type="button"
          aria-label={t("inbox.review")}
          title={view?.reviewedAt === undefined ? t("inbox.reviewNever") : t("inbox.reviewedAt", { when: relativeTime(view.reviewedAt, now) })}
          disabled={reviewState.busy || view?.reviewing === true}
          onClick={() => void review()}
          className="rounded p-1 text-zinc-500 hover:text-zinc-900 disabled:opacity-50 dark:hover:text-zinc-100"
        >
          <Sparkles size={14} className={reviewState.busy || view?.reviewing === true ? "animate-pulse" : ""} />
        </button>
        <button
          type="button"
          aria-label={t("inbox.refreshAria")}
          title={t("ui.refresh")}
          onClick={() => {
            setLatest(undefined);
            reload();
          }}
          className="rounded p-1 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          <RefreshCw size={14} className={fetched.loading ? "animate-spin" : ""} />
        </button>
      </PaneHeader>
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-3">
        {view === undefined ? (
          <Message tone={fetched.error === undefined ? "muted" : "error"} onRetry={fetched.error === undefined ? undefined : reload}>
            {fetched.error ?? t("inbox.gathering")}
          </Message>
        ) : (
          <>
            {/* The list stays from the last load, so a failed refresh would otherwise look like nothing new. */}
            {fetched.error !== undefined && (
              <p className="truncate px-2 py-1 text-[11px] text-red-600 dark:text-red-400" title={fetched.error}>
                {t("inbox.refreshFailed", { error: fetched.error })}
              </p>
            )}
            {listView === "newest" ? (
              shown.length === 0 ? (
                <p className="px-2 py-1 text-[11px] text-zinc-500">{empty}</p>
              ) : (
                <NewestList items={newestFirst(shown, now)} row={row} />
              )
            ) : (
              GROUPS.map(({ group: bucket, label }) => {
                const inGroup = shown.filter((item) => inboxGroup(item, monthStart) === bucket);
                // Older shows only when something is in it.
                if (bucket === "older" && inGroup.length === 0) return null;
                const isFolded = folded.includes(bucket);
                return (
                  <section key={bucket} className="mb-1">
                    <GroupHeader
                      title={t(label)}
                      count={inGroup.length}
                      open={!isFolded}
                      onToggle={() => setFolded((current) => (isFolded ? current.filter((b) => b !== bucket) : [...current, bucket]))}
                    />
                    {!isFolded && (inGroup.length === 0 ? <p className="px-2 pb-1 text-[11px] text-zinc-500">{empty}</p> : <ul>{inGroup.map(row)}</ul>)}
                  </section>
                );
              })
            )}
            {(view.problems.length > 0 || reviewNote !== undefined) && (
              <ul className="mt-2 flex flex-col gap-0.5 px-2 text-[11px] text-zinc-500">
                {view.problems.map((problem) => {
                  const message = "message" in problem ? problem.message : undefined;
                  const failure = describeSourceProblem(problem.source, message, "message" in problem ? problem : undefined);
                  // A known failure reads as a short label after the source's name; the raw message stays in the tooltip.
                  const text = "unavailable" in problem ? unavailableText(t, locale, problem.unavailable) : sourceProblemLabel(t, failure, problem.message);
                  return (
                    <li key={problem.source} className="flex min-w-0 items-center gap-1.5" title={message}>
                      <span className="min-w-0 truncate">
                        {sourceLabel(problem.source, t)}: {text}
                      </span>
                      {failure.fix !== undefined && (
                        <button
                          type="button"
                          className="shrink-0 text-teal-700 underline hover:text-teal-600 dark:text-teal-400"
                          onClick={() => {
                            const { fix } = failure;
                            if (fix !== undefined) openSettingsPage(fix.page, () => workbench.open({ kind: "settings" }), fix.page === "connections" ? fix.card : undefined);
                          }}
                        >
                          {t("inbox.fix")}
                        </button>
                      )}
                    </li>
                  );
                })}
                {reviewNote !== undefined && (
                  <li className="truncate" title={reviewNote}>
                    {t("inbox.claudeReview", { note: reviewNote })}
                  </li>
                )}
              </ul>
            )}
            {reviewLoginExpired && reviewNote !== undefined && <ClaudeLoginNote error={reviewNote} />}
          </>
        )}
      </div>
    </div>
  );
}
