import type { GmailErrorCode } from "@/lib/apiErrorCodes";
import { HttpError } from "@/platform/http/HttpError";

/**
 * ### GmailError
 *
 * A Gmail request failed; `code` tells the section what to show (sign in,
 * sign in again, enable the API, or a plain error).
 */
export class GmailError extends HttpError {
  constructor(message: string, status: number, code: GmailErrorCode) {
    super(message, status, code);
    this.name = "GmailError";
  }
}
