import type { Translate } from "@/ui/i18n/translate";

/**
 * ### statusColor
 *
 * Tailwind text color for a porcelain git status code: modified amber,
 * added or untracked green, deleted red, anything else (renamed, conflicted) teal.
 */
export function statusColor(code: string): string {
  if (code === "M") return "text-amber-600 dark:text-amber-400";
  if (code === "A" || code === "??") return "text-green-600 dark:text-green-400";
  if (code === "D") return "text-red-600 dark:text-red-400";
  return "text-teal-600 dark:text-teal-400";
}

/**
 * ### statusTitle
 *
 * @returns A human-readable description of a porcelain code, in the UI's language.
 */
export function statusTitle(t: Translate, code: string): string {
  switch (code) {
    case "M":
      return t("explorer.status.modified");
    case "A":
      return t("explorer.status.added");
    case "??":
      return t("explorer.status.untracked");
    case "D":
      return t("explorer.status.deleted");
    case "R":
      return t("explorer.status.renamed");
    case "C":
      return t("explorer.status.copied");
    case "U":
      return t("explorer.status.conflicted");
    default:
      return t("explorer.status.other", { code });
  }
}
