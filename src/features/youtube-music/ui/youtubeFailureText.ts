import type { YouTubeMusicErrorCode } from "@/lib/apiErrorCodes";
import type { Translate } from "@/ui/i18n/translate";
import type { ApiFailure } from "@/ui/useJson";

/**
 * ### youtubeFailureText
 *
 * A failed YouTube Music route in the chosen language, from its `code`.
 *
 * @returns The route's own text for `failed`, which is YouTube's message,
 *   and for a failure without a code (the network).
 */
export function youtubeFailureText(t: Translate, failure: ApiFailure<YouTubeMusicErrorCode>): string {
  switch (failure.code) {
    case undefined:
    case "failed":
      return failure.error;
    case "no-channel":
      return t("youtubeMusic.noChannel");
    default:
      return t(`youtubeMusic.failure.${failure.code}`);
  }
}
