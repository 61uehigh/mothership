import { z } from "zod";
import type { LinearIssue, Reaction } from "@/features/tools/model/Tools";
import { fetchIssueThread, hasLinearApiKey, type LinearReaction } from "@/features/tools/linear/server/linearApi";
import { notFoundOn, type ToolCaller } from "@/platform/mcp/ToolCaller";
import { isoToEpoch, linkMentions, parseJson, truncate } from "@/features/tools/server/sourceUtils";

const ISSUE_FIELDS = ["id", "title", "description", "url", "status", "priority", "assignee", "team", "project", "labels", "updatedAt"];
const COMMENT_LIMIT = 100;

// Shape of `get_issue` output from Linear's MCP server when `fields` is passed
// (checked against a real call: `labels` are names, people and teams are names).
const issueSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullish(),
  url: z.string().nullish(),
  status: z.string().nullish(),
  priority: z.object({ value: z.number(), name: z.string() }).nullish(),
  assignee: z.string().nullish(),
  team: z.string().nullish(),
  project: z.string().nullish(),
  labels: z.array(z.string()).nullish(),
  updatedAt: z.string().nullish(),
});

// Shape of `list_comments` output (`issueId`); replies carry a `parentId`.
const commentsSchema = z.object({
  comments: z.array(
    z.object({
      body: z.string(),
      createdAt: z.string(),
      author: z.object({ name: z.string() }).nullish(),
    }),
  ),
});

/**
 * ### fetchLinearIssue
 *
 * Reads the issue and its comments in parallel.
 *
 * @param issueId - Identifier such as `DEV-123`, or the issue UUID.
 * @returns The issue with comments oldest first.
 * @throws Error When a call fails or its output is not the expected JSON.
 */
export async function fetchLinearIssue(caller: ToolCaller, issueId: string): Promise<LinearIssue> {
  // With an API key, comments come from GraphQL, which also has their ids and
  // reactions. If that fails (an expired key, say), fall back to MCP comments
  // rather than failing the whole issue.
  const [issueText, thread] = await Promise.all([
    notFoundOn(caller.callText("get_issue", { id: issueId, fields: ISSUE_FIELDS }), /could not find referenced issue|entity not found/i),
    hasLinearApiKey()
      ? fetchIssueThread(issueId).catch((error: unknown) => {
          console.error(`[linear] GraphQL comments for ${issueId} failed; using MCP comments`, error);
          return undefined;
        })
      : undefined,
  ]);
  const commentsText =
    thread === undefined ? await caller.callText("list_comments", { issueId, limit: COMMENT_LIMIT, orderBy: "createdAt" }) : '{"comments":[]}';
  const issue = issueSchema.safeParse(parseJson(issueText));
  if (!issue.success) throw new Error(`Could not parse the Linear issue: ${truncate(issueText, 200)}`);
  const comments = commentsSchema.safeParse(parseJson(commentsText));
  if (!comments.success) throw new Error(`Could not parse the Linear comments: ${truncate(commentsText, 200)}`);
  const i = issue.data;
  return {
    id: i.id,
    title: i.title,
    markdown: linkMentions(i.description ?? "", thread?.viewer.displayName),
    url: i.url ?? undefined,
    status: i.status ?? undefined,
    priority: i.priority ?? undefined,
    assignee: i.assignee ?? undefined,
    team: i.team ?? undefined,
    project: i.project ?? undefined,
    labels: i.labels ?? [],
    updatedAt: isoToEpoch(i.updatedAt),
    comments: thread?.issue.comments.nodes
      .map((c) => ({
        id: c.id,
        parentId: c.parent?.id,
        author: c.user?.name ?? c.botActor?.name ?? undefined,
        body: linkMentions(c.body, thread.viewer.displayName),
        createdAt: isoToEpoch(c.createdAt) ?? 0,
        reactions: summarize(c.reactions, thread.viewer.id),
      }))
      .sort((a, b) => a.createdAt - b.createdAt) ??
      comments.data.comments
        .map((c) => ({ id: undefined, parentId: undefined, author: c.author?.name, body: linkMentions(c.body, undefined), createdAt: isoToEpoch(c.createdAt) ?? 0, reactions: [] }))
        .sort((a, b) => a.createdAt - b.createdAt),
    reactions: thread === undefined ? [] : summarize(thread.issue.reactions, thread.viewer.id),
    canReact: thread !== undefined,
  };
}

/**
 * ### summarize
 *
 * Groups reactions by emoji in first-use order, noting your own.
 */
export function summarize(reactions: Array<LinearReaction>, viewerId: string): Array<Reaction> {
  const byEmoji = new Map<string, Reaction>();
  for (const r of reactions) {
    const entry = byEmoji.get(r.emoji) ?? { emoji: r.emoji, count: 0, users: [], mine: undefined };
    entry.count++;
    if (r.user !== null && r.user !== undefined) entry.users.push(r.user.name);
    if (r.user?.id === viewerId) entry.mine = r.id;
    byEmoji.set(r.emoji, entry);
  }
  return [...byEmoji.values()];
}
