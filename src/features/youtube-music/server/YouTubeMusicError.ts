import type { YouTubeMusicErrorCode } from "@/lib/apiErrorCodes";
import { HttpError } from "@/platform/http/HttpError";

/**
 * ### YouTubeMusicError
 *
 * A YouTube Music request failed; `code` tells the section what to show
 * (sign in, connect again, quota used up, or a plain error).
 */
export class YouTubeMusicError extends HttpError {
  constructor(message: string, status: number, code: YouTubeMusicErrorCode) {
    super(message, status, code);
    this.name = "YouTubeMusicError";
  }
}
