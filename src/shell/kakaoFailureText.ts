import type { KakaoErrorCode } from "@/lib/apiErrorCodes";
import type { MacPermission } from "@/features/kakaotalk/model/KakaoTalk";
import type { Translate } from "@/ui/i18n/translate";
import type { ApiFailure } from "@/ui/useJson";

/**
 * ### macPermissionText
 *
 * What to allow, and where, for a KakaoTalk {@link MacPermission} in the chosen language.
 */
export function macPermissionText(t: Translate, permission: MacPermission): string {
  return permission === "accessibility" ? t("kakaotalk.permission.accessibility") : t("kakaotalk.permission.automation");
}

/**
 * ### kakaoFailureText
 *
 * A failed KakaoTalk route in the chosen language, from its `code`. Used by
 * the KakaoTalk section and its Settings card.
 *
 * @returns The failure's own message for a failure without a KakaoTalk code
 *   (the network, or the desktop host).
 */
export function kakaoFailureText(t: Translate, failure: ApiFailure<KakaoErrorCode>): string {
  switch (failure.code) {
    case "missing":
      return t("kakaotalk.error.missing");
    case "unsupported":
      return t("kakaotalk.error.unsupported");
    case "moved":
      return t("kakaotalk.error.moved");
    case "read-failed":
      return t("kakaotalk.error.readFailed", { detail: failure.error });
    case "open-failed":
      return t("kakaotalk.error.openFailed", { detail: failure.error });
    case "accessibility":
    case "automation":
      return macPermissionText(t, failure.code);
    default:
      // Codes are typed, but a failure can also come from the network or the desktop host.
      return failure.error;
  }
}
