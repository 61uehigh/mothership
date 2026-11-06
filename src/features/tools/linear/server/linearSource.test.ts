import { describe, expect, it } from "vitest";
import type { ToolCaller } from "@/platform/mcp/ToolCaller";
import type { LinearSubscribedPage } from "@/features/tools/linear/server/linearApi";
import {
  fetchAssignedLinearIssues,
  parseLinearNotifications,
  fetchSubscribedLinearIssues,
  sortLinearIssues,
  type LinearIssueRow,
  type SubscribedPageFetcher,
} from "@/features/tools/linear/server/linearSource";

const TODAY = "2026-11-16";
const STATES = ["started", "unstarted", "triage", "backlog"];

const row = (id: string, statusType: string, extra: Partial<LinearIssueRow> = {}): LinearIssueRow => ({
  id,
  title: id,
  statusType,
  updatedAt: "2026-11-01T00:00:00.000Z",
  ...extra,
});

const node = (id: string, type: string): LinearSubscribedPage["nodes"][number] => ({
  identifier: id,
  title: id,
  url: `https://linear.app/x/issue/${id}`,
  priority: 3,
  priorityLabel: "Medium",
  updatedAt: "2026-11-01T00:00:00.000Z",
  dueDate: null,
  state: { name: type, type },
  team: { name: "Team" },
});

describe("sortLinearIssues", () => {
  it("puts urgent and overdue first, then status order, then most recently updated", () => {
    const issues = [
      row("B-new", "backlog", { updatedAt: "2026-11-10T00:00:00Z" }),
      row("S-old", "started", { updatedAt: "2026-10-01T00:00:00Z" }),
      row("B-urgent", "backlog", { priority: { value: 1, name: "Urgent" } }),
      row("B-overdue", "backlog", { dueDate: "2026-11-01", updatedAt: "2026-10-31T00:00:00Z" }),
      row("B-old", "backlog", { updatedAt: "2026-09-01T00:00:00Z" }),
    ];
    expect(sortLinearIssues(issues, STATES, TODAY).map((i) => i.id)).toEqual(["B-urgent", "B-overdue", "S-old", "B-new", "B-old"]);
  });

  it("drops finished and repeated issues", () => {
    const issues = [row("A-1", "started"), row("A-1", "started"), row("A-2", "completed"), row("A-3", "canceled"), row("A-4", "duplicate")];
    expect(sortLinearIssues(issues, STATES, TODAY).map((i) => i.id)).toEqual(["A-1"]);
  });
});

describe("fetchSubscribedLinearIssues", () => {
  it("asks for open state types and follows every page", async () => {
    const calls: Array<Parameters<SubscribedPageFetcher>[0]> = [];
    const pages: Array<LinearSubscribedPage> = [
      { nodes: [node("B-1", "backlog")], pageInfo: { hasNextPage: true, endCursor: "c1" } },
      { nodes: [node("S-1", "started")], pageInfo: { hasNextPage: false, endCursor: null } },
    ];
    const fetchPage: SubscribedPageFetcher = async (options) => {
      calls.push(options);
      return pages[calls.length - 1];
    };
    const items = await fetchSubscribedLinearIssues(fetchPage, { states: STATES, limit: undefined, today: TODAY });
    expect(items.map((i) => [i.id, i.subtitle])).toEqual([
      ["S-1", "Team · started"],
      ["B-1", "Team · backlog"],
    ]);
    expect(calls.map((c) => c.after)).toEqual([undefined, "c1"]);
    expect(calls[0].stateTypes).toEqual(STATES);
  });
});

describe("fetchAssignedLinearIssues", () => {
  it("falls back to issues assigned to you, one call per state", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const caller: ToolCaller = {
      label: "linear",
      describe: async () => undefined,
      callText: async (_tool, args) => {
        calls.push(args);
        return JSON.stringify({ issues: args.state === "backlog" ? [row("B-1", "backlog"), row("D-1", "completed")] : [] });
      },
    };
    const items = await fetchAssignedLinearIssues(caller, { states: STATES, limit: undefined, today: TODAY });
    expect(items.map((i) => i.id)).toEqual(["B-1"]);
    expect(calls.map((c) => c.state)).toEqual(STATES);
    expect(calls.every((c) => c.assignee === "me")).toBe(true);
  });
});

describe("parseLinearNotifications", () => {
  const NOW = Date.parse("2026-11-17T06:00:00Z");
  it("reads the issue identifier from the link and drops archived and snoozed ones", () => {
    const n = (id: string, extra: Record<string, unknown>) => ({ id, type: "issueNewComment", title: "T", subtitle: "Kim commented", url: "https://linear.app/x/issue/DEV-2305/lte-데이터", createdAt: "2026-11-17T05:00:00Z", readAt: null, archivedAt: null, snoozedUntilAt: null, ...extra });
    const text = JSON.stringify({
      notifications: [n("keep", {}), n("read", { readAt: "2026-11-17T05:30:00Z" }), n("archived", { archivedAt: "2026-11-17T05:30:00Z" }), n("snoozed", { snoozedUntilAt: "2026-11-18T00:00:00Z" }), n("pr", { url: "https://linear.app/x/review/pr-1" })],
      hasNextPage: false,
    });
    expect(parseLinearNotifications(text, NOW).map((x) => [x.id, x.issueId, x.read])).toEqual([
      ["keep", "DEV-2305", false],
      ["read", "DEV-2305", true],
      ["pr", undefined, false],
    ]);
  });
});
