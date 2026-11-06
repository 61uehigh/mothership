import { z } from "zod";
import { HttpError } from "@/platform/http/HttpError";
import { envSecret } from "@/platform/envSecret";
import { postJson } from "@/platform/http/postJson";

const ENDPOINT = "https://api.linear.app/graphql";
const COMMENT_LIMIT = 100;

/**
 * ### hasLinearApiKey
 *
 * Whether `LINEAR_API_KEY` is set. Reactions need it: the Linear MCP server
 * has no reaction tools, so they go to the GraphQL API with the same key.
 */
export function hasLinearApiKey(): boolean {
  return envSecret("LINEAR_API_KEY") !== undefined;
}

async function graphql<T>(schema: z.ZodType<T>, query: string, variables: Record<string, unknown>, write = false): Promise<T> {
  const key = envSecret("LINEAR_API_KEY");
  if (key === undefined) throw new HttpError("Add your Linear API key in Settings → Connections", 409, "linear-key-missing");
  // Personal API keys go in the header as-is; Linear rejects them with a Bearer prefix.
  const response = await postJson(ENDPOINT, { query, variables }, { service: "Linear", headers: { Authorization: key }, write });
  if (response.status === 401 || response.status === 403) {
    throw new HttpError("Linear refused your API key. Replace it in Settings → Connections", 401, "linear-key-refused");
  }
  const body: unknown = await response.json().catch(() => undefined);
  const envelope = z
    .object({ data: z.unknown().optional(), errors: z.array(z.object({ message: z.string() })).optional() })
    .safeParse(body);
  if (!envelope.success) throw new HttpError(`Linear answered ${response.status} without JSON`, 502);
  if (envelope.data.errors !== undefined && envelope.data.errors.length > 0) {
    const message = envelope.data.errors.map((e) => e.message).join("; ");
    throw new HttpError(`Linear: ${message}`, /not found|entity not found/i.test(message) ? 404 : 502);
  }
  const data = schema.safeParse(envelope.data.data);
  if (!data.success) throw new HttpError(`Linear answered in an unexpected shape: ${z.prettifyError(data.error)}`, 502);
  return data.data;
}

const reactionSchema = z.object({ id: z.string(), emoji: z.string(), user: z.object({ id: z.string(), name: z.string() }).nullish() });

/**
 * ### LinearReaction
 *
 * One emoji reaction as Linear stores it; `emoji` is a shortcode name such as `+1`.
 */
export type LinearReaction = z.infer<typeof reactionSchema>;

const threadSchema = z.object({
  viewer: z.object({ id: z.string(), displayName: z.string() }),
  issue: z.object({
    id: z.string(),
    reactions: z.array(reactionSchema),
    comments: z.object({
      nodes: z.array(
        z.object({
          id: z.string(),
          body: z.string(),
          createdAt: z.string(),
          user: z.object({ name: z.string() }).nullish(),
          botActor: z.object({ name: z.string().nullish() }).nullish(),
          parent: z.object({ id: z.string() }).nullish(),
          reactions: z.array(reactionSchema),
        }),
      ),
    }),
  }),
});

/**
 * ### LinearIssueThread
 *
 * An issue's comments and reactions with the ids needed to reply and react.
 */
export type LinearIssueThread = z.infer<typeof threadSchema>;

/**
 * ### fetchIssueThread
 *
 * @param issueId - Identifier such as `DEV-123`, or the issue UUID.
 * @throws {@link HttpError}
 */
export function fetchIssueThread(issueId: string): Promise<LinearIssueThread> {
  return graphql(
    threadSchema,
    `query Thread($id: String!, $first: Int!) {
      viewer { id displayName }
      issue(id: $id) {
        id
        reactions { id emoji user { id name } }
        comments(first: $first) {
          nodes { id body createdAt user { name } botActor { name } parent { id } reactions { id emoji user { id name } } }
        }
      }
    }`,
    { id: issueId, first: COMMENT_LIMIT },
  );
}

/**
 * ### addLinearReaction
 *
 * @param target - The comment or issue (UUID or identifier) to react to.
 * @param emoji - Shortcode name, e.g. `+1`.
 * @throws {@link HttpError}
 */
export async function addLinearReaction(target: { commentId: string } | { issueId: string }, emoji: string): Promise<void> {
  await graphql(
    z.object({ reactionCreate: z.object({ success: z.literal(true, { error: "Linear did not add the reaction" }) }) }),
    `mutation React($input: ReactionCreateInput!) { reactionCreate(input: $input) { success } }`,
    { input: { ...target, emoji } },
    true,
  );
}

/**
 * ### removeLinearReaction
 *
 * @param reactionId - A reaction of yours, from {@link fetchIssueThread}.
 * @throws {@link HttpError}
 */
export async function removeLinearReaction(reactionId: string): Promise<void> {
  await graphql(
    z.object({ reactionDelete: z.object({ success: z.literal(true, { error: "Linear did not remove the reaction" }) }) }),
    `mutation Unreact($id: String!) { reactionDelete(id: $id) { success } }`,
    { id: reactionId },
    true,
  );
}

/**
 * ### canQueryLinearDirectly
 *
 * Whether lists may come straight from Linear's GraphQL API: `LINEAR_API_KEY`
 * is set and the real MCP config is in use. Demo mode points
 * `MOTHERSHIP_MCP_CONFIG` at made-up fixtures, so it never reads real issues.
 */
export function canQueryLinearDirectly(): boolean {
  // `||` on purpose: an empty MOTHERSHIP_MCP_CONFIG means "use the default".
  return hasLinearApiKey() && !(process.env.MOTHERSHIP_MCP_CONFIG || undefined);
}

const subscribedPageSchema = z.object({
  issues: z.object({
    nodes: z.array(
      z.object({
        identifier: z.string(),
        title: z.string(),
        url: z.string(),
        priority: z.number(),
        priorityLabel: z.string(),
        updatedAt: z.string(),
        dueDate: z.string().nullish(),
        state: z.object({ name: z.string(), type: z.string() }),
        team: z.object({ name: z.string() }).nullish(),
      }),
    ),
    pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullish() }),
  }),
});

/**
 * ### LinearSubscribedPage
 *
 * One page of {@link fetchSubscribedIssuePage}.
 */
export type LinearSubscribedPage = z.infer<typeof subscribedPageSchema>["issues"];

/**
 * ### fetchSubscribedIssuePage
 *
 * Issues the key's user is subscribed to (Linear subscribes you to issues you
 * create, are assigned, or are mentioned on, and to ones you subscribe to by
 * hand), most recently updated first. The Linear MCP server has no
 * subscriber filter, so this goes to GraphQL.
 *
 * @param options.stateTypes - Linear status types to include, e.g. `started`.
 * @param options.after - `endCursor` of the previous page.
 * @throws {@link HttpError}
 */
export async function fetchSubscribedIssuePage(options: {
  stateTypes: Array<string>;
  first: number;
  after: string | undefined;
}): Promise<LinearSubscribedPage> {
  const data = await graphql(
    subscribedPageSchema,
    `query Subscribed($first: Int!, $after: String, $types: [String!]!) {
      issues(
        first: $first
        after: $after
        orderBy: updatedAt
        filter: { subscribers: { some: { isMe: { eq: true } } }, state: { type: { in: $types } } }
      ) {
        nodes { identifier title url priority priorityLabel updatedAt dueDate state { name type } team { name } }
        pageInfo { hasNextPage endCursor }
      }
    }`,
    { first: options.first, after: options.after ?? null, types: options.stateTypes },
  );
  return data.issues;
}

const completedSchema = z.object({
  issues: z.object({
    nodes: z.array(z.object({ identifier: z.string(), title: z.string(), url: z.string(), completedAt: z.string() })),
  }),
});

const COMPLETED_LIMIT = 50;

/**
 * ### LinearCompletedIssue
 *
 * One issue of {@link fetchMyCompletedIssues}.
 */
export type LinearCompletedIssue = z.infer<typeof completedSchema>["issues"]["nodes"][number];

/**
 * ### fetchMyCompletedIssues
 *
 * Issues assigned to the key's user that were completed in `[from, to)`
 * (ISO times). The Linear MCP server cannot filter by completion time, so
 * this goes to GraphQL.
 *
 * @throws {@link HttpError} 409 when `LINEAR_API_KEY` is not set.
 */
export async function fetchMyCompletedIssues(from: string, to: string): Promise<Array<LinearCompletedIssue>> {
  const data = await graphql(
    completedSchema,
    `query Completed($first: Int!, $from: DateTimeOrDuration!, $to: DateTimeOrDuration!) {
      issues(first: $first, filter: { assignee: { isMe: { eq: true } }, completedAt: { gte: $from, lt: $to } }) {
        nodes { identifier title url completedAt }
      }
    }`,
    { first: COMPLETED_LIMIT, from, to },
  );
  return data.issues.nodes;
}
