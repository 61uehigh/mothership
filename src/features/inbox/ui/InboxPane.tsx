"use client";

import { Bot, ChevronRight, RefreshCw, Sparkles } from "lucide-react";
import { useEffect, useState, type ComponentType } from "react";
import { PaneHeader } from "@/shell/PaneHeader";
import { useWorkbench } from "@/shell/WorkbenchContext";
import { GitHubIcon, LinearIcon, SlackIcon, type BrandIconProps } from "@/ui/brandIcons";
import { relativeTime } from "@/ui/format";
import { fetchJson, useJson } from "@/ui/useJson";
import { useNow } from "@/ui/useNow";
import type { InboxBucket, InboxItem, InboxSource, InboxView } from "@/features/inbox/model/Inbox";

const CLOCK_TICK_MS = 30_000;
/** While Claude reviews in the background, look again this often. */
const REVIEW_POLL_MS = 5_000;

const GROUPS: Array<{ bucket: Exclude<InboxBucket, "hidden">; label: string }> = [
  { bucket: "today", label: "Today" },
  { bucket: "week", label: "This week" },
  { bucket: "month", label: "This month" },
];

const SOURCE_ICON: Record<InboxSource, ComponentType<BrandIconProps>> = { agent: Bot, github: GitHubIcon, slack: SlackIcon, linear: LinearIcon };
const SOURCE_LABEL: Record<InboxSource, string> = { agent: "Agents", github: "GitHub", slack: "Slack", linear: "Linear" };

function Row({ item, now, onOpen }: { item: InboxItem; now: number; onOpen: () => void }) {
  const Icon = SOURCE_ICON[item.source];
  return (
    <li>
      <button type="button" onClick={onOpen} className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-zinc-200/60 dark:hover:bg-zinc-800/60">
        <Icon size={13} aria-label={SOURCE_LABEL[item.source]} className="mt-0.5 shrink-0 text-zinc-500" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13px]">{item.title}</span>
          <span className="flex gap-1 truncate text-[11px] text-zinc-500">
            <span className={item.movedBy === "claude" ? "text-violet-600 dark:text-violet-400" : ""} title={item.reason}>
              {item.movedBy === "claude" && <Sparkles size={10} aria-label="Moved by Claude" className="mr-0.5 inline align-[-1px]" />}
              {item.reason}
            </span>
            {item.subtitle !== undefined && <span className="truncate">· {item.subtitle}</span>}
          </span>
        </span>
        {item.at !== undefined && <span className="shrink-0 text-[11px] text-zinc-500">{relativeTime(item.at, now)}</span>}
      </button>
    </li>
  );
}

/**
 * ### InboxPane
 *
 * What needs you, from agents, GitHub, Slack, and Linear, grouped into today,
 * this week, and this month by your rules (Settings → Inbox). Each item says
 * why it is there; once a day Claude moves the ones the rules seem to have
 * sorted wrongly (marked with a sparkle).
 */
export function InboxPane() {
  const workbench = useWorkbench();
  const now = useNow(CLOCK_TICK_MS);
  const [refresh, setRefresh] = useState(0);
  const fetched = useJson<InboxView>(refresh === 0 ? "/api/inbox" : `/api/inbox?refresh=1&n=${refresh}`);
  const [reviewed, setReviewed] = useState<InboxView | undefined>(undefined);
  const [reviewState, setReviewState] = useState<{ busy: boolean; error: string | undefined }>({ busy: false, error: undefined });
  const [folded, setFolded] = useState<Array<InboxBucket>>([]);
  const view = reviewed ?? fetched.data;
  const { reload } = fetched;

  // A background review finishes on its own; pick up its moves when it does.
  useEffect(() => {
    if (view?.reviewing !== true) return;
    const timer = setInterval(reload, REVIEW_POLL_MS);
    return () => clearInterval(timer);
  }, [view?.reviewing, reload]);

  async function review() {
    setReviewState({ busy: true, error: undefined });
    const result = await fetchJson<InboxView>("/api/inbox/review", { method: "POST" });
    if (result.ok) setReviewed(result.data);
    setReviewState({ busy: false, error: result.ok ? undefined : result.error });
  }

  function open(item: InboxItem) {
    if (item.open.kind === "url") window.open(item.open.url, "_blank", "noopener");
    else workbench.open(item.open, { preview: true });
  }

  const reviewNote = reviewState.error ?? view?.reviewError;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PaneHeader title="Inbox">
        <button
          type="button"
          aria-label="Review with Claude"
          title={view?.reviewedAt === undefined ? "Have Claude check the sorting" : `Claude checked the sorting ${relativeTime(view.reviewedAt, now)}; check again`}
          disabled={reviewState.busy || view?.reviewing === true}
          onClick={() => void review()}
          className="rounded p-1 text-zinc-500 hover:text-zinc-900 disabled:opacity-50 dark:hover:text-zinc-100"
        >
          <Sparkles size={13} className={reviewState.busy || view?.reviewing === true ? "animate-pulse" : ""} />
        </button>
        <button
          type="button"
          aria-label="Refresh Inbox"
          title="Refresh"
          onClick={() => {
            setReviewed(undefined);
            setRefresh((n) => n + 1);
          }}
          className="rounded p-1 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          <RefreshCw size={13} className={fetched.loading ? "animate-spin" : ""} />
        </button>
      </PaneHeader>
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-3">
        {view === undefined ? (
          <p className="px-2 py-1 text-xs text-zinc-500">{fetched.error ?? "Gathering what needs you…"}</p>
        ) : (
          <>
            {GROUPS.map(({ bucket, label }) => {
              const items = view.items.filter((item) => item.bucket === bucket);
              const isFolded = folded.includes(bucket);
              return (
                <section key={bucket} className="mb-1">
                  <button
                    type="button"
                    aria-expanded={!isFolded}
                    onClick={() => setFolded((current) => (isFolded ? current.filter((b) => b !== bucket) : [...current, bucket]))}
                    className="flex w-full items-center gap-1 px-2 py-1 text-[11px] font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                  >
                    <ChevronRight size={12} className={`transition-transform ${isFolded ? "" : "rotate-90"}`} aria-hidden />
                    <span className="flex-1 text-left">{label}</span>
                    <span className="tabular-nums">{items.length}</span>
                  </button>
                  {!isFolded &&
                    (items.length === 0 ? (
                      <p className="px-7 pb-1 text-[11px] text-zinc-500">Nothing.</p>
                    ) : (
                      <ul>
                        {items.map((item) => (
                          <Row key={item.id} item={item} now={now} onOpen={() => open(item)} />
                        ))}
                      </ul>
                    ))}
                </section>
              );
            })}
            {(view.problems.length > 0 || reviewNote !== undefined) && (
              <ul className="mt-2 flex flex-col gap-0.5 px-2 text-[11px] text-zinc-500">
                {view.problems.map((problem) => (
                  <li key={problem.source} className="truncate" title={problem.message}>
                    {SOURCE_LABEL[problem.source]}: {problem.message}
                  </li>
                ))}
                {reviewNote !== undefined && (
                  <li className="truncate" title={reviewNote}>
                    Claude review: {reviewNote}
                  </li>
                )}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
