"use client";

import { Eye, ListChecks, Sparkles } from "lucide-react";
import { useState, type ReactNode } from "react";
import { ClaudeLoginNote, isClaudeLoginFailure } from "@/shell/ClaudeLoginNote";
import { useJson } from "@/ui/useJson";
import type { PrSummaryView } from "@/features/github/model/PrSummary";

const DATE_FORMAT: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" };
const BUTTON = "inline-flex items-center gap-1 rounded-md border border-zinc-300 px-2 py-0.5 text-[11px] hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800";

function Group({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-zinc-800 dark:text-zinc-200">
        {icon}
        {title}
      </h3>
      <ul className="flex flex-col gap-1 pl-5 text-[13px] leading-5">{children}</ul>
    </section>
  );
}

/**
 * ### PrSummaryCard
 *
 * Claude's short summary of a pull request for reviewing it: what the
 * patch does, its key changes, and where to look hardest. Made on its own for open PRs; for merged or
 * closed ones only when you ask. Saved per head commit.
 *
 * @param open - The PR is open, so its summary is made without asking.
 */
export function PrSummaryCard({ repo, number, headRefOid, open }: { repo: string; number: number; headRefOid: string; open: boolean }) {
  const [asked, setAsked] = useState(open);
  const [fresh, setFresh] = useState(0);
  const base = `/api/github/pr/summary?repo=${encodeURIComponent(repo)}&number=${number}`;
  // The head commit is in the URL, so a push seen on reload loads its own summary.
  const url = !asked ? undefined : fresh === 0 ? `${base}&head=${headRefOid}` : `${base}&fresh=1&n=${fresh}`;
  const state = useJson<PrSummaryView>(url, { keepPrevious: true });
  const view = state.data;
  const summary = view?.summary;

  return (
    <section className="border-b border-zinc-200 bg-violet-50/40 px-6 py-4 dark:border-zinc-800 dark:bg-violet-950/10">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <Sparkles size={14} className="text-violet-600 dark:text-violet-400" aria-hidden />
          Review summary
        </h2>
        {view !== undefined && (
          <span className="text-[11px] text-zinc-500">
            {view.headRefOid.slice(0, 7)} · {new Date(view.summarizedAt).toLocaleString(undefined, DATE_FORMAT)}
          </span>
        )}
        <span className="ml-auto">
          {asked ? (
            <button type="button" className={BUTTON} disabled={state.loading} onClick={() => setFresh((n) => n + 1)}>
              <Sparkles size={11} aria-hidden />
              Summarize again
            </button>
          ) : (
            <button type="button" className={BUTTON} onClick={() => setAsked(true)}>
              <Sparkles size={11} aria-hidden />
              Summarize
            </button>
          )}
        </span>
      </div>
      {!asked && <p className="text-[13px] text-zinc-500">Have Claude say in a few lines what this patch does and where to look.</p>}
      {asked && state.loading && <p className="text-[13px] text-zinc-500">{view === undefined ? "Claude is reading the diff… (up to a couple of minutes)" : "Summarizing again…"}</p>}
      {asked && !state.loading && state.error !== undefined &&
        (isClaudeLoginFailure(state.failure) ? <ClaudeLoginNote error={state.error} /> : <p className="text-[13px] break-words text-red-600 dark:text-red-400">{state.error}</p>)}
      {summary !== undefined && (
        <div className={`flex flex-col gap-3 ${state.loading ? "opacity-50" : ""}`}>
          <p className="text-[14px] leading-6 text-zinc-800 dark:text-zinc-200">{summary.gist}</p>
          {summary.changes.length > 0 && (
            <Group icon={<ListChecks size={13} className="text-teal-600" aria-hidden />} title="What it does">
              {summary.changes.map((change, i) => (
                <li key={i} className="list-disc">
                  {change}
                </li>
              ))}
            </Group>
          )}
          {summary.reviewFocus.length > 0 && (
            <Group icon={<Eye size={13} className="text-rose-600" aria-hidden />} title="Look closely at">
              {summary.reviewFocus.map((focus, i) => (
                <li key={i} className="list-disc">
                  {focus}
                </li>
              ))}
            </Group>
          )}
          {view?.truncated === true && <p className="text-[11px] text-zinc-500">The diff was too long to read in full; the end of it was left out.</p>}
        </div>
      )}
    </section>
  );
}
