import { HttpError } from "@/platform/http/HttpError";

const TIMEOUT_MS = 15_000;

/**
 * ### postJson
 *
 * POSTs `body` as JSON to an outside service's API, giving up after 15 seconds.
 *
 * @param options - `service` names the service in messages; `timeoutMessage`
 *   replaces the default when a timed-out call may still have done its work.
 * @returns The response, whatever its status; the caller reads its body.
 * @throws {@link HttpError} 504 when it timed out, 502 when the service could not be reached.
 */
export async function postJson(
  url: string,
  body: unknown,
  options: { service: string; headers: Record<string, string>; timeoutMessage?: string },
): Promise<Response> {
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...options.headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") throw new HttpError(options.timeoutMessage ?? `${options.service} did not answer in time`, 504);
    throw new HttpError(`Could not reach ${options.service}`, 502);
  }
}
