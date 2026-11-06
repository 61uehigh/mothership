const HTML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", "#x27": "'", nbsp: " " };

/**
 * ### unescapeHtml
 *
 * Undoes the HTML escaping some APIs put on plain text (Gmail snippets,
 * YouTube search titles). Only the entities those APIs send; any other
 * `&…;` is left as it is.
 */
export function unescapeHtml(text: string): string {
  return text.replace(/&(amp|lt|gt|quot|#39|#x27|nbsp);/g, (match, name: string) => HTML_ENTITIES[name] ?? match);
}
