import { z } from "zod";
import { HttpError } from "@/platform/http/HttpError";
import type { ToolOutcome } from "@/features/tools/server/DashboardService";

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
 * @throws The error itself when it is not an `HttpError` (Next answers 500).
 */
export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message, ...(error.code === undefined ? {} : { code: error.code }) }, { status: error.status });
  }
  throw error;
}

/**
 * ### respondWith
 *
 * Turns a tool outcome into a route response.
 *
 * @param what - What was requested, for messages, e.g. `Nuclino doc 1234`.
 * @returns 200 with the value; 409 when the tool is not set up; 404 when the
 *   tool says the item does not exist (a `ToolNotFoundError` from the loader);
 *   502 for any other tool failure. Error bodies are `{ error }`.
 */
export function respondWith<T>(outcome: ToolOutcome<T>, what: string): Response {
  switch (outcome.status) {
    case "ok":
      return Response.json(outcome.value);
    case "unavailable":
      return Response.json({ error: `Can't load ${what}: ${outcome.reason}` }, { status: 409 });
    case "error":
      return outcome.notFound
        ? Response.json({ error: `${what} was not found or you don't have access to it.` }, { status: 404 })
        : Response.json({ error: outcome.message }, { status: 502 });
  }
}
