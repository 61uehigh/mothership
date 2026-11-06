import { z } from "zod";
import type {
  Agent,
  AgentEventRecord,
  AgentMessage,
  AgentQuestion,
  AgentStatus,
  MessageKind,
} from "@/features/sessions/model/Agent";
import { AGENT_KINDS, type AgentKind, type Effort, type UsageTotals } from "@/features/sessions/model/AgentEvents";

/**
 * ### Row
 *
 * One row as `node:sqlite` returns it.
 */
export type Row = Record<string, unknown>;

// Schemas for the JSON-encoded columns. Plain columns are typed by the schema
// in database.ts and written only by the repositories, so they are read without validation.
const stringListSchema = z.array(z.string());
const linksSchema = z.array(z.object({ label: z.string(), url: z.string() }));
const worktreeSchema = z.object({
  repo: z.string(),
  path: z.string(),
  branch: z.string(),
  baseCommit: z.string(),
  baseBranch: z.string(),
  state: z.enum(["active", "merged", "discarded"]),
});
const usageSchema = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheReadTokens: z.number(),
  cacheWriteTokens: z.number(),
  costUsd: z.number(),
  billing: z.enum(["subscription", "api"]),
});

const eventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({
    type: z.literal("tool"),
    name: z.string(),
    detail: z.string(),
    id: z.string().optional(),
    result: z.object({ output: z.string(), failed: z.boolean() }).optional(),
  }),
  z.object({ type: z.literal("tool_result"), id: z.string(), output: z.string(), failed: z.boolean() }),
  // `JSON.stringify` drops undefined fields, so `totals` and `usage` may be missing. Turns stored
  // before they existed carry only `costUsd`, the session's running cost, which is not shown.
  z.object({ type: z.literal("done"), output: z.string(), totals: usageSchema.optional(), usage: usageSchema.optional() }),
  z.object({
    type: z.literal("error"),
    message: z.string(),
    // Missing on errors that are the tool's own text, and on events stored before it existed.
    failure: z
      .discriminatedUnion("code", [
        z.object({ code: z.literal("stream-ended"), provider: z.enum(AGENT_KINDS) }),
        z.object({ code: z.literal("run-failed"), provider: z.enum(AGENT_KINDS), reason: z.string() }),
      ])
      .optional(),
  }),
  // A provider's own sub-agent (see NativeSubagentEvent); `model` may be missing for the same reason as `totals`.
  z.discriminatedUnion("phase", [
    z.object({ type: z.literal("subagent"), phase: z.literal("start"), id: z.string(), description: z.string(), kind: z.string(), model: z.string().optional() }),
    z.object({ type: z.literal("subagent"), phase: z.literal("step"), id: z.string(), tool: z.string() }),
    z.object({ type: z.literal("subagent"), phase: z.literal("end"), id: z.string(), output: z.string(), failed: z.boolean() }),
  ]),
]);

/**
 * Parses and validates one JSON column of a row.
 *
 * @throws Error Naming the table, column, and row id when the stored value is malformed.
 */
function jsonColumn<T>(schema: z.ZodType<T>, table: string, column: string, row: Row): T {
  const where = `${table}.${column} of row ${String(row.id)}`;
  let json: unknown;
  try {
    json = JSON.parse(String(row[column]));
  } catch (error) {
    throw new Error(`${where} is not valid JSON`, { cause: error });
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new Error(`${where} is malformed: ${z.prettifyError(parsed.error)}`);
  return parsed.data;
}

/** Like {@link jsonColumn}, for a nullable column: SQL `NULL` reads as `undefined`. */
function optionalJsonColumn<T>(schema: z.ZodType<T>, table: string, column: string, row: Row): T | undefined {
  return row[column] === null || row[column] === undefined ? undefined : jsonColumn(schema, table, column, row);
}

/**
 * ### optionalString
 *
 * A TEXT column that may be NULL, as `undefined`.
 */
export function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * ### toAgent
 *
 * @returns The agent an `agents` row stores; JSON columns are checked, not trusted.
 */
export function toAgent(row: Row): Agent {
  // Plain columns are written only by the repositories, so their types are known.
  return {
    id: row.id as string,
    name: row.name as string,
    role: optionalString(row.role),
    provider: row.provider as AgentKind,
    model: optionalString(row.model),
    effort: optionalString(row.effort) as Effort | undefined,
    parentId: optionalString(row.parent_id),
    status: row.status as AgentStatus,
    sessionRef: optionalString(row.session_ref),
    workingDirectory: row.working_directory as string,
    mcp: optionalJsonColumn(stringListSchema, "agents", "mcp", row),
    createdAt: Number(row.created_at),
    lastActivityAt: Number(row.last_activity_at),
    statusNote: optionalString(row.status_note),
    links: jsonColumn(linksSchema, "agents", "links", row),
    worktree: optionalJsonColumn(worktreeSchema, "agents", "worktree", row),
    compareGroup: optionalString(row.compare_group),
    archivedAt: row.archived_at === null || row.archived_at === undefined ? undefined : Number(row.archived_at),
    allowGit: Number(row.allow_git) === 1,
    stoppedByRestart: Number(row.stopped_by_restart) === 1,
    suggestion: optionalString(row.suggestion),
    origin: row.origin === "feedback" ? "feedback" : undefined,
  };
}

/**
 * ### toQuestion
 *
 * @returns The question a `questions` row stores.
 */
export function toQuestion(row: Row): AgentQuestion {
  // Plain columns are written only by the repositories, so their types are known.
  return {
    id: row.id as string,
    agentId: row.agent_id as string,
    kind: row.kind === "approval" ? "approval" : "question",
    question: row.question as string,
    options: jsonColumn(stringListSchema, "questions", "options", row),
    status: row.status as AgentQuestion["status"],
    answer: optionalString(row.answer),
    createdAt: Number(row.created_at),
    resolvedAt: row.resolved_at === null ? undefined : Number(row.resolved_at),
  };
}

/**
 * ### toMessage
 *
 * @returns The message a `messages` row stores.
 */
export function toMessage(row: Row): AgentMessage {
  // Plain columns are written only by the repositories, so their types are known.
  return {
    id: row.id as string,
    agentId: row.agent_id as string,
    senderId: optionalString(row.sender_id),
    kind: row.kind as MessageKind,
    text: row.text as string,
    createdAt: Number(row.created_at),
    deliveredAt: row.delivered_at === null ? undefined : Number(row.delivered_at),
  };
}

/**
 * ### parseUsageTotals
 *
 * @returns Usage totals read from a JSON column, or `undefined` when missing or malformed.
 */
export function parseUsageTotals(json: unknown): UsageTotals | undefined {
  if (typeof json !== "string") return undefined;
  try {
    const parsed = usageSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

/**
 * ### toEvent
 *
 * @returns The event an `events` row stores; its JSON payload is checked, not trusted.
 */
export function toEvent(row: Row): AgentEventRecord {
  const event = jsonColumn(eventSchema, "events", "payload", row);
  return {
    id: Number(row.id),
    agentId: row.agent_id as string,
    // Spelled out so missing fields become explicit `undefined`s.
    event:
      event.type === "done"
        ? { type: "done", output: event.output, totals: event.totals, usage: event.usage }
        : event.type === "subagent" && event.phase === "start"
          ? { ...event, model: event.model }
          : event,
    createdAt: Number(row.created_at),
  };
}
