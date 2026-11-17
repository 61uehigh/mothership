import type { KakaoErrorCode } from "@/lib/apiErrorCodes";
import { HttpError } from "@/platform/http/HttpError";

/**
 * ### KakaoError
 *
 * Reading or opening KakaoTalk failed. The UI words it from `code`; the
 * message is for logs, except for `read-failed` and `open-failed`, where it
 * is what `osascript` said and is shown as it is.
 */
export class KakaoError extends HttpError {
  constructor(message: string, status: number, code: KakaoErrorCode, options?: ErrorOptions) {
    super(message, status, code, options);
    this.name = "KakaoError";
  }
}
