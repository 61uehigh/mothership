import type { DockerErrorCode } from "@/lib/apiErrorCodes";
import type { Translate } from "@/ui/i18n/translate";
import type { ApiFailure } from "@/ui/useJson";

/**
 * ### dockerFailureText
 *
 * A failed Docker route in the chosen language, from its `code`.
 *
 * @returns The failure's own message for `failed` (the CLI's own output) and
 *   for a failure without a Docker code (the network, or the desktop host).
 */
export function dockerFailureText(t: Translate, failure: ApiFailure<DockerErrorCode>): string {
  switch (failure.code) {
    case "missing":
      return t("docker.failure.missing");
    case "daemon":
      return t("docker.failure.daemon");
    default:
      return failure.error;
  }
}
