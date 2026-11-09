import type { ActivityItem } from "@/features/todos/model/Daily";
import type { Agent } from "@/features/sessions/model/Agent";
import type { CalendarEventDetail } from "@/features/tools/model/Tools";

/**
 * ### PrEvent
 *
 * One of your pull requests opened or merged, as GitHub's search reports
 * it; `repo` is `owner/name`.
 */
export type PrEvent = { what: "opened" | "merged"; repo: string; number: number; title: string; url: string; at: number };

/**
 * ### CompletedIssue
 *
 * A Linear issue you completed; `completedAt` is an ISO time.
 */
export type CompletedIssue = { identifier: string; title: string; url: string; completedAt: string };

/**
 * ### prActivity
 *
 * A pull request as a Daily item, detailed as `name#12` (the repository
 * without its owner, which is nearly always you or your team).
 */
export function prActivity(pr: PrEvent): ActivityItem {
  return {
    id: `pr-${pr.what}:${pr.repo}#${pr.number}`,
    kind: pr.what === "merged" ? "pr-merged" : "pr-opened",
    title: pr.title,
    detail: `${pr.repo.split("/")[1] ?? pr.repo}#${pr.number}`,
    at: pr.at,
    url: pr.url,
  };
}

/**
 * ### linearActivity
 *
 * A completed Linear issue as a Daily item, dated when it was completed.
 */
export function linearActivity(issue: CompletedIssue): ActivityItem {
  return { id: `linear-done:${issue.identifier}`, kind: "linear-done", title: issue.title, detail: issue.identifier, at: Date.parse(issue.completedAt), url: issue.url };
}

/**
 * ### sessionActivity
 *
 * The sessions you started (not their sub-agents) as Daily items, each
 * dated when you last worked in it if that was in `[from, to)`, else when
 * it was made; the day's own bounds then drop the rest.
 */
export function sessionActivity(
  agents: ReadonlyArray<Pick<Agent, "id" | "name" | "parentId" | "workingDirectory" | "createdAt" | "lastActivityAt">>,
  range: { from: number; to: number },
): Array<ActivityItem> {
  return agents.flatMap((agent) => {
    if (agent.parentId !== undefined) return [];
    const at = agent.lastActivityAt >= range.from && agent.lastActivityAt < range.to ? agent.lastActivityAt : agent.createdAt;
    return [{ id: `session:${agent.id}`, kind: "session" as const, title: agent.name, detail: agent.workingDirectory.split(/[\\/]/).at(-1), at, url: undefined, agentId: agent.id }];
  });
}

/**
 * ### meetingActivity
 *
 * The meetings among calendar events as Daily items: all-day events,
 * events without a start time, and ones you declined are left out.
 */
export function meetingActivity(events: ReadonlyArray<Pick<CalendarEventDetail, "id" | "title" | "location" | "start" | "end" | "url" | "allDay" | "myResponse">>): Array<ActivityItem> {
  return events.flatMap((e) =>
    e.allDay || e.start === undefined || e.myResponse === "declined"
      ? []
      : [{ id: `meeting:${e.id}`, kind: "meeting" as const, title: e.title, detail: e.location, at: e.start, end: e.end, url: e.url, eventId: e.id }],
  );
}
