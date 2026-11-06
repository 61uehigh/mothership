import { z } from "zod";
import { errorMessage } from "@/lib/errors";
import { HttpError } from "@/platform/http/HttpError";
import type { ToolOutcome } from "@/features/tools/server/DashboardService";
import { toolFailure } from "@/features/tools/server/toolFailure";

/**
 * ### parseQuery
 *
 * Validates a request's query string against `schema`.
 *
 * @returns The parsed values, or a 400 response to return as-is.
 */
export function parseQuery<T>(request: Request, schema: z.ZodType<T>): T | Response {
  const parsed = schema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  return parsed.success ? parsed.data : Response.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
}

/**
 * ### parseBody
 *
 * Reads and validates a JSON body. Malformed JSON is a 400, not a crash.
 *
 * @returns The parsed values, or a 400 response to return as-is.
 */
export async function parseBody<T>(request: Request, schema: z.ZodType<T>): Promise<T | Response> {
  const json: unknown = await request.json().catch(() => undefined);
  const parsed = await schema.safeParseAsync(json);
  return parsed.success ? parsed.data : Response.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
}

/**
 * ### errorResponse
 *
 * Answers an {@link HttpError} with its status as `{ error, code? }`.
 *
 * @param otherStatus - The status for any other error, answered as `{ error }`.
 * @throws The error itself when it is not an `HttpError` and no `otherStatus` is given (Next answers 500).
 */
export function errorResponse(error: unknown, otherStatus?: number): Response {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message, ...(error.code === undefined ? {} : { code: error.code }) }, { status: error.status });
  }
  if (otherStatus !== undefined) return Response.json({ error: errorMessage(error) }, { status: otherStatus });
  throw error;
}

/**
 * ### respondWith
 *
 * Turns a tool outcome into a route response: 200 with the value, otherwise
 * the status {@link toolFailure} gives, as `{ error, code? }`.
 *
 * @param what - What was requested, for messages, e.g. `Nuclino doc 1234`.
 */
export function respondWith<T>(outcome: ToolOutcome<T>, what: string): Response {
  return outcome.status === "ok" ? Response.json(outcome.value) : errorResponse(toolFailure(outcome, what));
}
