import type { MessageKey } from "@/ui/i18n/messages";
import type { Translate } from "@/ui/i18n/translate";

type GroupKey = Extract<MessageKey, `group.${string}`>;

/**
 * ### CommandGroup
 *
 * A command's heading in the command center and the shortcuts list.
 */
export type CommandGroup = "General" | "Navigation" | "View" | "Sidebars" | "Sessions" | "Review" | "Compare" | "Inbox" | "Todo" | "Developer" | "YouTube Music";

/** `undefined` for a product name, which reads the same in every language. */
const GROUP_LABELS: Record<CommandGroup, GroupKey | undefined> = {
  General: "group.General",
  Navigation: "group.Navigation",
  View: "group.View",
  Sidebars: "group.Sidebars",
  Sessions: "group.Sessions",
  Review: "group.Review",
  Compare: "group.Compare",
  Inbox: "group.Inbox",
  Todo: "group.Todo",
  Developer: "group.Developer",
  "YouTube Music": undefined,
};

/**
 * ### commandGroupLabel
 *
 * A command's group as headed in the command center and the shortcuts list,
 * in the UI's language.
 */
export function commandGroupLabel(t: Translate, group: CommandGroup): string {
  const key = GROUP_LABELS[group];
  return key === undefined ? group : t(key);
}
