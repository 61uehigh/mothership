"use client";

import { ChevronDown, ChevronRight, Settings2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { relativeTime } from "@/ui/format";
import { useLocalRepos } from "@/features/github/ui/api";
import { ManageReposDialog } from "@/features/github/ui/ManageReposDialog";
import { ChecksDot, IssueIcon, OutcomeIcon, PrStateIcon, runOutcome } from "@/features/github/ui/icons";
import { ICON_BUTTON, RefreshButton } from "@/ui/IconButton";
import { Message } from "@/ui/Message";
import { useToggleSet } from "@/ui/useToggleSet";
import { useJson } from "@/ui/useJson";
import { useNow } from "@/ui/useNow";
import { useStoredState } from "@/ui/useStoredState";
import { PaneHeader } from "@/shell/PaneHeader";
import { tabKey, type Tab } from "@/shell/tabs";
import { useWorkbench } from "@/shell/WorkbenchContext";
import { ALL_REPOSITORIES, type GhErrorCode, type Overview, type PrListItem } from "@/features/github/model/GitHub";

const CLOCK_TICK_MS = 30_000;

type SectionId = "mine" | "review" | "issues" | "runs";

const CHOICE_KEY = "mothership.github.repo";
const parseChoice = (raw: string): string => raw;

const ROW = "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-zinc-200/60 dark:hover:bg-zinc-800/70";

/**
 * ### GitHubPane
 *
 * Left sidebar for GitHub: for the chosen repository, the user's open pull
 * requests, review requests, assigned issues, and recent workflow runs; or,
 * with "All repositories", the first three across every repository on
 * GitHub. The choice is remembered. The list holds local checkouts
 * (repositories.yaml first) plus repositories added from your account, and
 * the gear manages it. A click on a pull request previews it in a tab; a
 * double click pins it. Issues and runs open on github.com.
 */
export function GitHubPane() {
  const workbench = useWorkbench();
  const now = useNow(CLOCK_TICK_MS);
  const repos = useLocalRepos();
  const [chosen, setChosen] = useStoredState(CHOICE_KEY, "", parseChoice);
  const [managing, setManaging] = useState(false);
  const [collapsed, toggle] = useToggleSet<SectionId>();

  const list = repos.data?.repos ?? [];
  // A remembered repository that left the list falls back to the first one.
  const repo = chosen === ALL_REPOSITORIES || list.some((r) => r.repo === chosen) ? chosen : (list[0]?.repo ?? ALL_REPOSITORIES);
  const all = repo === ALL_REPOSITORIES;
  const activePr = workbench.active?.tab.kind === "pr" ? workbench.active.key : undefined;
  // Refresh asks the route to skip its cache.
  const overview = useJson<Overview, GhErrorCode>(repos.data === undefined ? undefined : `/api/github/overview?repo=${encodeURIComponent(repo)}`, {
    refreshOnReload: true,
  });

  function refresh() {
    repos.reload();
    overview.reload();
  }

  function prRow(pr: PrListItem) {
    const tab: Tab = { kind: "pr", repo: pr.repo ?? repo, number: pr.number };
    const selected = activePr === tabKey(tab);
    return (
      <li key={`${tab.repo}#${pr.number}`}>
        <button
          type="button"
          title={pr.title}
          onClick={() => workbench.open(tab, { preview: true })}
          onDoubleClick={() => workbench.open(tab)}
          className={`${ROW} ${selected ? "bg-teal-100/70 dark:bg-teal-900/40" : ""}`}
        >
          <PrStateIcon state={pr.state} isDraft={pr.isDraft} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[13px]">{pr.title}</span>
            <span className="flex items-center gap-1.5 truncate text-[11px] text-zinc-500">
              <span className="shrink-0">#{pr.number}</span>
              {all ? <span className="truncate">{tab.repo}</span> : pr.author !== undefined && <span className="truncate">{pr.author}</span>}
              {now > 0 && <span className="ml-auto shrink-0">{relativeTime(Date.parse(pr.updatedAt), now)}</span>}
            </span>
          </span>
          <ChecksDot checks={pr.checks} />
        </button>
      </li>
    );
  }

  let body: ReactNode;
  if (repos.error !== undefined) {
    body = <Message tone="error">{repos.error}</Message>;
  } else if (repos.data === undefined) {
    body = <Message>Looking for repositories…</Message>;
  } else if (overview.error !== undefined) {
    body = <Message tone="error">{overview.error}</Message>;
  } else if (overview.data === undefined) {
    body = <Message>Loading…</Message>;
  } else {
    const data = overview.data;
    body = (
      <>
        <Section id="mine" title="Your pull requests" count={data.myPullRequests.length} collapsed={collapsed} onToggle={toggle} empty="No open pull requests.">
          {data.myPullRequests.map(prRow)}
        </Section>
        <Section id="review" title="Review requests" count={data.reviewRequests.length} collapsed={collapsed} onToggle={toggle} empty="Nothing to review.">
          {data.reviewRequests.map(prRow)}
        </Section>
        <Section id="issues" title="Assigned issues" count={data.assignedIssues.length} collapsed={collapsed} onToggle={toggle} empty="No open issues assigned to you.">
          {data.assignedIssues.map((issue) => (
            <li key={`${issue.repo ?? repo}#${issue.number}`}>
              <a href={issue.url} target="_blank" rel="noopener noreferrer" title={issue.title} className={ROW}>
                <IssueIcon />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[13px]">{issue.title}</span>
                  <span className="flex gap-1.5 text-[11px] text-zinc-500">
                    <span className="shrink-0">#{issue.number}</span>
                    {all && issue.repo !== undefined && <span className="truncate">{issue.repo}</span>}
                    {now > 0 && <span className="ml-auto shrink-0">{relativeTime(Date.parse(issue.updatedAt), now)}</span>}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </Section>
        {!all && (
        <Section id="runs" title="Recent runs" count={data.runs.length} collapsed={collapsed} onToggle={toggle} empty="No workflow runs.">
          {data.runs.map((run) => (
            <li key={run.id}>
              <a href={run.url} target="_blank" rel="noopener noreferrer" title={`${run.name}: ${run.title}`} className={ROW}>
                <OutcomeIcon outcome={runOutcome(run.status, run.conclusion)} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[13px]">{run.title}</span>
                  <span className="flex gap-1.5 truncate text-[11px] text-zinc-500">
                    <span className="truncate">
                      {run.name} · {run.branch}
                    </span>
                    {now > 0 && <span className="ml-auto shrink-0">{relativeTime(Date.parse(run.updatedAt), now)}</span>}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </Section>
        )}
      </>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PaneHeader title="GitHub">
        <button type="button" aria-label="Manage repositories" title="Add or remove repositories" className={ICON_BUTTON} onClick={() => setManaging(true)}>
          <Settings2 size={14} />
        </button>
        <RefreshButton loading={overview.loading} onClick={refresh} />
      </PaneHeader>
      {repos.data !== undefined && (
        <div className="px-2 pb-2">
          <select
            aria-label="Repository"
            className="w-full rounded-md border border-zinc-300 bg-transparent px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
            value={repo}
            onChange={(e) => setChosen(e.target.value)}
          >
            <option value={ALL_REPOSITORIES}>All repositories</option>
            {list.map((r) => (
              <option key={r.repo} value={r.repo}>
                {r.repo}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-3">{body}</div>
      {managing && repos.data !== undefined && (
        <ManageReposDialog list={repos.data} onChanged={repos.reload} onClose={() => setManaging(false)} />
      )}
    </div>
  );
}

function Section({
  id,
  title,
  count,
  collapsed,
  onToggle,
  empty,
  children,
}: {
  id: SectionId;
  title: string;
  count: number;
  collapsed: ReadonlySet<SectionId>;
  onToggle: (id: SectionId) => void;
  empty: string;
  children: ReactNode;
}) {
  const open = !collapsed.has(id);
  return (
    <section className="mb-1">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => onToggle(id)}
        className="flex w-full items-center gap-1 rounded px-1 py-1 text-[11px] font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span>{title}</span>
        <span className="ml-auto rounded-full bg-zinc-200 px-1.5 text-[10px] dark:bg-zinc-800">{count}</span>
      </button>
      {open && (count === 0 ? <p className="px-6 py-1 text-[11px] text-zinc-500">{empty}</p> : <ul>{children}</ul>)}
    </section>
  );
}
