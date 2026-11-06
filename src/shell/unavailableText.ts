import type { UnavailableReason } from "@/features/tools/model/Dashboard";
import { sectionTitle } from "@/shell/sections";
import type { Locale, Translate } from "@/ui/i18n/translate";

/**
 * ### unavailableText
 *
 * Why a tool can't be reached, in the chosen language.
 */
export function unavailableText(t: Translate, locale: Locale, reason: UnavailableReason): string {
  switch (reason.code) {
    case "turned-off":
      return t("tools.unavailable.turnedOff", { widget: sectionTitle(locale, t, reason.kind, reason.widget) });
    case "not-connected":
      return t("tools.unavailable.notConnected");
    case "no-server":
      return t("tools.unavailable.noServer", { server: reason.server });
    case "mcp-config-unreadable":
      return t("tools.unavailable.mcpConfigUnreadable", { error: reason.error });
    case "no-widget":
      return t("tools.widgetMissing", { kind: reason.kind });
  }
}
