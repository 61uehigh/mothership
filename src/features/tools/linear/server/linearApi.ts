import { z } from "zod";
import { HttpError } from "@/platform/http/HttpError";

const ENDPOINT = "https://api.linear.app/graphql";
const TIMEOUT_MS = 15_000;
const COMMENT_LIMIT = 100;

/**
 * ### LinearApiError
 *
 * A Linear GraphQL call failed. `status` is the HTTP status to answer with.
 */
export class LinearApiError extends HttpError {
  constructor(message: string, status: number) {
    super(message, status);
    this.name = "LinearApiError";
  }
}

/**
 * ### hasLinearApiKey
 *
 * Whether `LINEAR_API_KEY` is set. Reactions need it: the Linear MCP server
 * has no reaction tools, so they go to the GraphQL API with the same key.
 */
export function hasLinearApiKey(): boolean {
  // `||`-style check on purpose: the .env template leaves this as an empty string.
  return (process.env.LINEAR_API_KEY ?? "") !== "";
}

async function graphql<T>(schema: z.ZodType<T>, query: string, variables: Record<string, unknown>): Promise<T> {
  const key = process.env.LINEAR_API_KEY;
  if (key === undefined || key === "") throw new LinearApiError("Set LINEAR_API_KEY in .env.local to use Linear reactions", 409);
  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      // Personal API keys go in the header as-is; Linear rejects them with a Bearer prefix.
      headers: { "Content-Type": "application/json", Authorization: key },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    throw new LinearApiError(timedOut ? "Linear did not answer in time" : "Could not reach Linear", timedOut ? 504 : 502);
  }
  if (response.status === 401 || response.status === 403) {
    throw new LinearApiError("Linear refused LINEAR_API_KEY. Check that the key in .env.local is valid", 401);
  }
  const body: unknown = await response.json().catch(() => undefined);
  const envelope = z
    .object({ data: z.unknown().optional(), errors: z.array(z.object({ message: z.string() })).optional() })
    .safeParse(body);
  if (!envelope.success) throw new LinearApiError(`Linear answered ${response.status} without JSON`, 502);
  if (envelope.data.errors !== undefined && envelope.data.errors.length > 0) {
    const message = envelope.data.errors.map((e) => e.message).join("; ");
    throw new LinearApiError(`Linear: ${message}`, /not found|entity not found/i.test(message) ? 404 : 502);
  }
  const data = schema.safeParse(envelope.data.data);
  if (!data.success) throw new LinearApiError(`Linear answered in an unexpected shape: ${z.prettifyError(data.error)}`, 502);
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
 * @throws {@link LinearApiError}
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
 * @throws {@link LinearApiError}
 */
export async function addLinearReaction(target: { commentId: string } | { issueId: string }, emoji: string): Promise<void> {
  await graphql(
    z.object({ reactionCreate: z.object({ success: z.literal(true, { error: "Linear did not add the reaction" }) }) }),
    `mutation React($input: ReactionCreateInput!) { reactionCreate(input: $input) { success } }`,
    { input: { ...target, emoji } },
  );
}

/**
 * ### removeLinearReaction
 *
 * @param reactionId - A reaction of yours, from {@link fetchIssueThread}.
 * @throws {@link LinearApiError}
 */
export async function removeLinearReaction(reactionId: string): Promise<void> {
  await graphql(
    z.object({ reactionDelete: z.object({ success: z.literal(true, { error: "Linear did not remove the reaction" }) }) }),
    `mutation Unreact($id: String!) { reactionDelete(id: $id) { success } }`,
    { id: reactionId },
  );
}
