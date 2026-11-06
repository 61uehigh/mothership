import type { Translate } from "@/ui/i18n/translate";

/**
 * ### itemTitle
 *
 * A title an outside tool wrote, or "(untitled)" in the chosen language when
 * it gave none. Tabs keep the raw title and call this when drawn, so the
 * word follows a later language switch.
 */
export function itemTitle(t: Translate, title: string): string {
  return title === "" ? t("tools.untitled") : title;
}

/**
 * ### TITLE_PATH_SEPARATOR
 *
 * Joins the raw titles of a nested item and its parents, e.g. a meeting
 * collection saved as `Meetings / Weekly`.
 */
export const TITLE_PATH_SEPARATOR = " / ";

/**
 * ### itemPathTitle
 *
 * {@link itemTitle} for each part of a title joined with
 * {@link TITLE_PATH_SEPARATOR}, so an untitled parent reads "(untitled)" in
 * the language of the moment rather than the one it was saved in.
 */
export function itemPathTitle(t: Translate, title: string): string {
  return title
    .split(TITLE_PATH_SEPARATOR)
    .map((part) => itemTitle(t, part))
    .join(TITLE_PATH_SEPARATOR);
}
