/**
 * ### IMPORT_LIST_LIMIT
 *
 * How many recent sessions each provider lists for import.
 */
export const IMPORT_LIST_LIMIT = 50;

/**
 * ### INJECTED
 *
 * Text the tools inject into the conversation that you did not type. Both
 * wrap it in XML-style tags (`<environment_context>`, `<system-reminder>`, …),
 * which people do not start their own messages with.
 */
export const INJECTED = /^\s*(<[A-Za-z_][\w-]*(\s[^>]*)?>|# AGENTS\.md instructions)/;

/**
 * ### firstLine
 *
 * @returns A session title from its text: the first line that is not a
 *   Markdown heading (such as "## Referenced ChatGPT conversation:"), cut to `max` characters.
 */
export function firstLine(text: string, max = 80): string {
  const lines = text.trim().split("\n").map((l) => l.trim()).filter((l) => l !== "");
  const line = lines.find((l) => !l.startsWith("#")) ?? lines[0] ?? "";
  return line.length <= max ? line : `${line.slice(0, max - 1)}…`;
}
