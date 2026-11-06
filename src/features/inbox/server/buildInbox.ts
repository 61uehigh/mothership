import { classify, type InboxBucket, type InboxFacts, type InboxItem, type InboxOpen, type InboxRules, type InboxSource, type InboxView } from "@/features/inbox/model/Inbox";
import type { Overview } from "@/features/github/model/GitHub";
import type { AgentQuestion } from "@/features/sessions/model/Agent";
import type { DashboardItem, WidgetResult } from "@/features/tools/model/Dashboard";

/**
 * ### InboxInputs
 *
 * Everything the Inbox is built from, already loaded. A source that failed
 * comes as an `Error`; one that is not set up as `undefined`.
 */
export type InboxInputs = {
  questions: Array<AgentQuestion>;
  agentNames: Map<string, string>;
  slack: WidgetResult | undefined;
  linear: WidgetResult | undefined;
  github: { overview: Overview; statuses: Map<string, { failing: boolean; changesRequested: boolean }> } | Error;
};

type Candidate = Omit<InboxItem, "bucket" | "reason" | "movedBy">;

const firstLine = (text: string) => text.trim().split("\n")[0] ?? "";

/** A widget's items as candidates; a failure or missing setup becomes a problem to show. */
function fromWidget(
  result: WidgetResult | undefined,
  source: InboxSource,
  problems: InboxView["problems"],
  toCandidate: (item: DashboardItem) => Candidate | undefined,
): Array<Candidate> {
  if (result === undefined) return [];
  if (result.status === "unavailable") {
    problems.push({ source, message: result.reason });
    return [];
  }
  if (result.status === "error") {
    problems.push({ source, message: result.message });
    return [];
  }
  return result.items.flatMap((item) => toCandidate(item) ?? []);
}

/**
 * ### buildInbox
 *
 * Turns what each source returned into Inbox items, sorted by your rules,
 * then moved where today's Claude review said so.
 *
 * @param moves - Claude's moves by item id, from today's review.
 * @param today - Your local date, `YYYY-MM-DD`.
 */
export function buildInbox(
  inputs: InboxInputs,
  rules: InboxRules,
  moves: Record<string, { bucket: InboxBucket; why: string }>,
  now: number,
  today: string,
): Pick<InboxView, "items" | "problems"> {
  const problems: InboxView["problems"] = [];
  const candidates: Array<Candidate> = [];

  for (const question of inputs.questions.filter((q) => q.status === "open")) {
    candidates.push({
      id: `question:${question.id}`,
      source: "agent",
      title: firstLine(question.question),
      subtitle: inputs.agentNames.get(question.agentId),
      at: question.createdAt,
      facts: { kind: "agentQuestion" },
      open: { kind: "inbox", questionId: question.id },
    });
  }

  if (inputs.github instanceof Error) {
    problems.push({ source: "github", message: inputs.github.message });
  } else {
    const { overview, statuses } = inputs.github;
    for (const pr of overview.reviewRequests) {
      const repo = pr.repo ?? overview.repo;
      candidates.push({
        id: `review:${repo}#${pr.number}`,
        source: "github",
        title: pr.title,
        subtitle: `${repo} #${pr.number}${pr.author === undefined ? "" : ` · ${pr.author}`}`,
        at: Date.parse(pr.updatedAt),
        facts: { kind: "reviewRequest" },
        open: { kind: "pr", repo, number: pr.number },
      });
    }
    for (const pr of overview.myPullRequests) {
      const repo = pr.repo ?? overview.repo;
      const status = statuses.get(`${repo}#${pr.number}`);
      candidates.push({
        id: `pr:${repo}#${pr.number}`,
        source: "github",
        title: pr.title,
        subtitle: `${repo} #${pr.number}`,
        at: Date.parse(pr.updatedAt),
        facts: { kind: "myPr", failing: status?.failing ?? false, changesRequested: status?.changesRequested ?? false, draft: pr.isDraft },
        open: { kind: "pr", repo, number: pr.number },
      });
    }
    for (const issue of overview.assignedIssues) {
      const repo = issue.repo ?? overview.repo;
      candidates.push({
        id: `issue:${repo}#${issue.number}`,
        source: "github",
        title: issue.title,
        subtitle: `${repo} #${issue.number}`,
        at: Date.parse(issue.updatedAt),
        facts: { kind: "githubIssue" },
        open: { kind: "url", url: issue.url },
      });
    }
  }

  candidates.push(
    ...fromWidget(inputs.slack, "slack", problems, (item) =>
      item.url === undefined
        ? undefined
        : {
            id: `slack:${item.id}`,
            source: "slack",
            title: item.title,
            subtitle: item.subtitle,
            at: item.at,
            facts: { kind: "slack", mention: item.badge?.label === "Mention" } satisfies InboxFacts,
            open: { kind: "slack", url: item.url, title: item.title } satisfies InboxOpen,
          },
    ),
    ...fromWidget(inputs.linear, "linear", problems, (item) => ({
      id: `linear:${item.id}`,
      source: "linear",
      title: item.title,
      subtitle: [item.meta, item.subtitle].filter(Boolean).join(" · ") || undefined,
      at: item.at,
      facts: { kind: "linear", due: item.due, priority: item.priority },
      open: { kind: "issue", issueId: item.id, title: item.title },
    })),
  );

  const items = candidates.map((candidate): InboxItem => {
    const ruled = classify(candidate.facts, candidate.at, rules, now, today);
    const moved = moves[candidate.id];
    // Claude never brings back what your rules hide.
    return moved !== undefined && ruled.bucket !== "hidden" && moved.bucket !== ruled.bucket
      ? { ...candidate, bucket: moved.bucket, reason: `${moved.why} (Claude; rules: ${ruled.reason})`, movedBy: "claude" }
      : { ...candidate, ...ruled, movedBy: undefined };
  });
  // Newest first within each bucket; the browser groups them.
  items.sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
  return { items, problems };
}
