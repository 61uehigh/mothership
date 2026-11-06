import type { GhErrorCode } from "@/lib/apiErrorCodes";
import type { Translate } from "@/ui/i18n/translate";
import type { ApiFailure } from "@/ui/useJson";

/**
 * ### ghFailureText
 *
 * A failed GitHub route in the chosen language, from its `code`.
 *
 * @param failure - From a route that answers {@link GhErrorCode}s, perhaps
 *   among others (the PR summary also answers Claude's).
 * @returns The failure's own message for `failed` (the CLI's own output) and
 *   for any other failure (the network, the desktop host, or a code
 *   `useJson` has already worded).
 */
export function ghFailureText(t: Translate, failure: ApiFailure<GhErrorCode | (string & {})>): string {
  switch (failure.code) {
    case "missing":
      return t("github.failure.missing");
    case "auth":
      return t("github.failure.auth");
    default:
      return failure.error;
  }
}
