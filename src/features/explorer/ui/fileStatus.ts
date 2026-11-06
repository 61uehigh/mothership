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
 * ### statusLabel
 *
 * @returns The one-letter badge for a porcelain code (`??` shows as `U`, like VS Code).
 */
export function statusLabel(code: string): string {
  return code === "??" ? "U" : code;
}

/**
 * ### statusTitle
 *
 * @returns A human-readable description of a porcelain code, for tooltips.
 */
export function statusTitle(code: string): string {
  switch (code) {
    case "M":
      return "Modified";
    case "A":
      return "Added";
    case "??":
      return "Untracked";
    case "D":
      return "Deleted";
    case "R":
      return "Renamed";
    case "C":
      return "Copied";
    case "U":
      return "Conflicted";
    default:
      return `Status ${code}`;
  }
}
