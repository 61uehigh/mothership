import type { ItemBadge, ItemMeta, ItemTone, WidgetNote } from "@/features/tools/model/Dashboard";
import type { Translate } from "@/ui/i18n/translate";

/**
 * ### BADGE_TONE
 *
 * The colour intent of each {@link ItemBadge}.
 */
export const BADGE_TONE: Record<ItemBadge, ItemTone> = {
  overdue: "danger",
  urgent: "danger",
  high: "warning",
  dm: "neutral",
  mention: "info",
  group: "neutral",
};

/**
 * ### badgeLabel
 *
 * A badge's word in the chosen language.
 */
export function badgeLabel(t: Translate, badge: ItemBadge): string {
  switch (badge) {
    case "overdue":
      return t("tools.badge.overdue");
    case "urgent":
      return t("tools.badge.urgent");
    case "high":
      return t("tools.badge.high");
    case "dm":
      return t("tools.badge.dm");
    case "mention":
      return t("tools.badge.mention");
    case "group":
      return t("tools.badge.group");
  }
}

/**
 * ### metaText
 *
 * A row's right-hand text: the source's own text as it is, or an all-day
 * event in the chosen language (with its `MM-DD` in search results).
 */
export function metaText(t: Translate, meta: ItemMeta): string {
  if (typeof meta === "string") return meta;
  return meta.day === undefined ? t("calendar.allDay") : `${meta.day.slice(5)} ${t("calendar.allDay")}`;
}

/**
 * ### noteText
 *
 * A widget's known limit in the chosen language.
 */
export function noteText(t: Translate, note: WidgetNote): string {
  switch (note) {
    case "connector-usage":
      return t("tools.note.connectorUsage");
    case "slack-recent":
      return t("tools.note.slackRecent");
    case "nuclino-recent":
      return t("tools.note.nuclinoRecent");
    case "notion-shared":
      return t("tools.note.notionShared");
  }
}
