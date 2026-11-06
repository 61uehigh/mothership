import { z } from "zod";
import type { ApiErrorCode } from "@/lib/apiErrorCodes";
import { errorMessage } from "@/lib/errors";
import { translator, type MessageParams } from "@/ui/i18n/translate";
import { HttpError } from "@/platform/http/HttpError";
import type { ToolOutcome } from "@/features/tools/server/DashboardService";
import { toolFailure } from "@/features/tools/server/toolFailure";

/**
 * A 400 listing every problem. A custom check that gives `params: { code }`
 * (one of `API_ERROR_CODES`) sends that code too, so the browser words the
 * first such problem in its language.
 */
function invalid(error: z.ZodError): Response {
  const code = error.issues.flatMap((issue) => (issue.code === "custom" && typeof issue.params?.code === "string" ? [issue.params.code] : []))[0];
  return Response.json({ error: z.prettifyError(error), ...(code === undefined ? {} : { code }) }, { status: 400 });
}

/**
 * ### parseQuery
 *
 * Validates a request's query string against `schema`.
 *
 * @returns The parsed values, or a 400 response to return as-is.
 */
export function parseQuery<T>(request: Request, schema: z.ZodType<T>): T | Response {
  const parsed = schema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  return parsed.success ? parsed.data : invalid(parsed.error);
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
  return parsed.success ? parsed.data : invalid(parsed.error);
}

/**
 * ### errorResponse
 *
 * Answers an {@link HttpError} with its status as `{ error, code?, params? }`.
 *
 * @param otherStatus - The status for any other error, answered as `{ error }`.
 * @throws The error itself when it is not an `HttpError` and no `otherStatus` is given (Next answers 500).
 */
export function errorResponse(error: unknown, otherStatus?: number): Response {
  if (error instanceof HttpError) {
    return Response.json(
      { error: error.message, ...(error.code === undefined ? {} : { code: error.code }), ...(error.params === undefined ? {} : { params: error.params }) },
      { status: error.status },
    );
  }
  if (otherStatus !== undefined) return Response.json({ error: errorMessage(error) }, { status: otherStatus });
  throw error;
}

/**
 * ### respondWith
 *
 * Turns a tool outcome into a route response: 200 with the value, otherwise
 * the status {@link toolFailure} gives, as `{ error, code?, params? }`.
 *
 * @param what - What was requested, for messages, e.g. `Nuclino doc 1234`.
 */
export function respondWith<T>(outcome: ToolOutcome<T>, what: string): Response {
  return outcome.status === "ok" ? Response.json(outcome.value) : errorResponse(toolFailure(outcome, what));
}

const english = translator("en");

/** The codes whose text needs no facts; the others (e.g. `claude-failed`) are thrown as an `HttpError` with `params`. */
type PlainApiErrorCode = { [C in ApiErrorCode]: MessageParams<`apiError.${C}`> extends [] ? C : never }[ApiErrorCode];

/**
 * ### apiError
 *
 * Answers a failure the browser words itself: `{ error, code }`, where
 * `error` is the catalog's English text for `code`, for callers that are
 * not the UI.
 */
export function apiError(code: PlainApiErrorCode, status: number): Response {
  return Response.json({ error: english(`apiError.${code}`), code }, { status });
}

/**
 * ### orNotFound
 *
 * The lookup-or-404 every route with an id in its path does.
 *
 * @param code - What is missing, e.g. `session-not-found`.
 * @returns `value` when it exists, otherwise a 404 {@link apiError} to return as-is.
 */
export function orNotFound<T>(value: T | undefined, code: PlainApiErrorCode): T | Response {
  return value === undefined ? apiError(code, 404) : value;
}
