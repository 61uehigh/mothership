import type { GoogleOAuthSignInFailureCode } from "@/lib/apiErrorCodes";
import type { Translate } from "@/ui/i18n/translate";

/**
 * ### googleSignInFailureText
 *
 * Why one of the app's own Google sign-ins (Gmail, YouTube Music) was not
 * kept, in the chosen language. Google's own words, the failure's `detail`,
 * are shown beside it as they came.
 */
export function googleSignInFailureText(t: Translate, code: GoogleOAuthSignInFailureCode): string {
  switch (code) {
    case "sign-in-timed-out":
      return t("oauth.failure.sign-in-timed-out");
    case "sign-in-unknown":
      return t("oauth.failure.sign-in-unknown");
    case "no-refresh-token":
      return t("oauth.failure.no-refresh-token");
    case "disconnected-meanwhile":
      return t("oauth.failure.disconnected-meanwhile");
    case "denied":
      return t("oauth.failure.denied");
    case "sign-in-failed":
      return t("oauth.failure.sign-in-failed");
  }
}
