/**
 * ### nuclinoUrl
 *
 * @returns The web link for a Nuclino item, as Nuclino's MCP docs define it;
 *   shared by the sources and by tabs that have only the item's id.
 */
export function nuclinoUrl(itemId: string): string {
  return `https://app.nuclino.com/t/b/${itemId}`;
}

/**
 * ### notionUrl
 *
 * @returns A web link for a Notion page id (dashes dropped, as Notion's own
 *   links write it), for when the tool gives none.
 */
export function notionUrl(pageId: string): string {
  return `https://www.notion.so/${pageId.replace(/-/g, "")}`;
}
