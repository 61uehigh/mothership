import type { GmailErrorCode } from "@/lib/apiErrorCodes";
import type { Translate } from "@/ui/i18n/translate";
import type { ApiFailure } from "@/ui/useJson";

/**
 * ### gmailFailureText
 *
 * A failed Gmail route in the chosen language, from its `code`.
 *
 * @returns The route's own text for `failed`, which is Gmail's message, and
 *   for a failure without a code (the network).
 */
export function gmailFailureText(t: Translate, failure: ApiFailure<GmailErrorCode>): string {
  return failure.code === undefined || failure.code === "failed" ? failure.error : t(`gmail.failure.${failure.code}`);
}
