import { HttpError } from "@/platform/http/HttpError";

const TIMEOUT_MS = 15_000;

/**
 * ### postJson
 *
 * POSTs `body` as JSON to an outside service's API, giving up after 15 seconds.
 *
 * @param options - `service` names the service in messages and in the error's
 *   `params`; `write` marks a call that changes something (a send, a
 *   reaction), which may still have gone through when it times out.
 * @returns The response, whatever its status; the caller reads its body.
 * @throws {@link HttpError} 504 when it timed out (`send-timed-out` for a
 *   write, `timed-out` otherwise), 502 `service-unreachable` when the service
 *   could not be reached.
 */
export async function postJson(
  url: string,
  body: unknown,
  options: { service: string; headers: Record<string, string>; write?: boolean },
): Promise<Response> {
  const { service } = options;
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...options.headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      if (options.write === true) {
        throw new HttpError(`${service} did not answer in time; check before trying again`, 504, "send-timed-out", { params: { service } });
      }
      throw new HttpError(`${service} did not answer in time`, 504, "timed-out");
    }
    throw new HttpError(`Could not reach ${service}`, 502, "service-unreachable", { cause: error, params: { service } });
  }
}
