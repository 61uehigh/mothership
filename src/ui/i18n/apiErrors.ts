import { API_ERROR_CODES, type ApiErrorCode } from "@/lib/apiErrorCodes";
import { translator, type Locale } from "@/ui/i18n/translate";

const isApiErrorCode = (code: string): code is ApiErrorCode => (API_ERROR_CODES as ReadonlyArray<string>).includes(code);

/**
 * ### apiErrorText
 *
 * @param code - The `code` a route answered with, if any.
 * @param params - The facts the route sent beside it, e.g. `claude-failed`'s
 *   `detail` (Claude's own words, shown as they are) or the branches of
 *   `repo-on-other-branch`.
 * @returns The failure in `locale`'s words when `code` is one of
 *   `API_ERROR_CODES`; `undefined` for other codes (Docker's, Google's, …),
 *   whose routes' own text is shown instead.
 */
export function apiErrorText(code: string | undefined, locale: Locale, params?: Readonly<Record<string, unknown>>): string | undefined {
  if (code === undefined || !isApiErrorCode(code)) return undefined;
  const t = translator(locale);
  const fact = (name: string) => (typeof params?.[name] === "string" ? params[name] : "");
  switch (code) {
    case "claude-failed":
      return t("apiError.claude-failed", { detail: fact("detail") });
    case "not-a-repository":
      return t("apiError.not-a-repository", { folder: fact("folder") });
    case "detached-head":
      return t("apiError.detached-head", { folder: fact("folder") });
    case "repo-on-other-branch":
      return t("apiError.repo-on-other-branch", { current: fact("current"), base: fact("base") });
    case "todos-file-invalid":
      return t("apiError.todos-file-invalid", { file: fact("file") });
    case "todos-file-unreadable":
      return t("apiError.todos-file-unreadable", { file: fact("file") });
    case "send-timed-out":
      return t("apiError.send-timed-out", { service: fact("service") });
    case "service-unreachable":
      return t("apiError.service-unreachable", { service: fact("service") });
    default:
      return t(`apiError.${code}`);
  }
}

/**
 * ### pageLocale
 *
 * The UI's language outside React: `<html lang>`, which the pre-paint
 * script and `useLocale` keep in step with the saved choice.
 */
export function pageLocale(): Locale {
  return typeof document !== "undefined" && document.documentElement.lang === "ko" ? "ko" : "en";
}
