import { BookOpen, NotebookText } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { GoogleCalendarIcon, LinearIcon, SlackIcon, type BrandIconProps } from "@/ui/brandIcons";
import type { ConnectionId } from "@/features/settings/model/Settings";
import type { Translate } from "@/ui/i18n/translate";

/**
 * ### TokenStep
 *
 * One step of making a tool's token, with a link to the exact page.
 *
 * @param hint - Where to click on that page; shown as the step's tooltip and under Details.
 * @param again - The step's line when replacing a refused token, e.g. "Create a new API key".
 */
export type TokenStep = { label: string; again?: string; link?: { href: string; label: string }; hint?: string };

/**
 * ### ConnectionInfo
 *
 * How to set up one tool, shown on its card in Settings.
 */
export type ConnectionInfo = {
  label: string;
  icon: ComponentType<BrandIconProps>;
  /** What connecting gives you, in one line. */
  description: string;
  /** Label of each `.env.local` token the MCP server needs. */
  fields: Record<string, { label: string; placeholder: string }>;
  /** Steps before pasting the token; they read as done once it is saved. */
  tokenSteps?: Array<TokenStep>;
  /** The paste step's line, e.g. "Paste the key". */
  pasteLabel?: string;
  /** Steps after pasting that the app cannot check, such as sharing pages with an integration. */
  afterSteps?: Array<TokenStep>;
  /** The background behind the steps: what to click and which permissions, for Details. */
  howTo?: ReactNode;
  /** A setup with its own steps instead of `tokenSteps`. */
  setup?: "google" | "slack";
  /** Why the token is worth setting with the claude.ai connector too; the fields then show in that mode as well, under this line. */
  withConnector?: string;
};

/**
 * ### connectionInfo
 *
 * Setup notes for each tool in {@link ConnectionId} order, in the chosen
 * language. Names of buttons and pages on the tools' own sites stay as those
 * sites show them.
 */
export function connectionInfo(t: Translate): Record<ConnectionId, ConnectionInfo> {
  return {
    google_calendar: {
      label: "Google Calendar",
      icon: GoogleCalendarIcon,
      description: t("settings.info.calendar.description"),
      fields: {},
      setup: "google",
    },
    slack: {
      label: "Slack",
      icon: SlackIcon,
      description: t("settings.info.slack.description"),
      fields: { SLACK_USER_TOKEN: { label: t("settings.info.key"), placeholder: "xoxp-…" } },
      pasteLabel: t("settings.info.slack.paste"),
      setup: "slack",
      withConnector: t("settings.info.slack.withConnector"),
    },
    linear: {
      label: "Linear",
      icon: LinearIcon,
      description: t("settings.info.linear.description"),
      fields: { LINEAR_API_KEY: { label: t("settings.info.linear.field"), placeholder: "lin_api_…" } },
      tokenSteps: [
        {
          label: t("settings.info.linear.create"),
          again: t("settings.info.linear.createNew"),
          link: { href: "https://linear.app/settings/account/security", label: t("settings.info.open", { name: "Linear" }) },
          hint: "Personal API keys → New API key",
        },
      ],
      pasteLabel: t("settings.info.pasteKey"),
      howTo: t("settings.info.linear.howTo"),
    },
    nuclino: {
      label: "Nuclino",
      icon: BookOpen,
      description: t("settings.info.nuclino.description"),
      fields: { NUCLINO_API_KEY: { label: t("settings.info.apiKey"), placeholder: t("settings.info.nuclino.placeholder") } },
      tokenSteps: [
        {
          label: t("settings.info.createApiKey"),
          again: t("settings.info.createNewApiKey"),
          link: { href: "https://app.nuclino.com", label: t("settings.info.open", { name: "Nuclino" }) },
          hint: t("settings.info.nuclino.hint"),
        },
      ],
      pasteLabel: t("settings.info.pasteKey"),
      howTo: t("settings.info.nuclino.howTo"),
    },
    notion: {
      label: "Notion",
      icon: NotebookText,
      description: t("settings.info.notion.description"),
      fields: { NOTION_TOKEN: { label: t("settings.info.key"), placeholder: "ntn_…" } },
      tokenSteps: [
        {
          label: t("settings.info.notion.create"),
          again: t("settings.info.notion.createNew"),
          link: { href: "https://www.notion.so/profile/integrations", label: t("settings.info.open", { name: "Notion" }) },
          hint: t("settings.info.notion.hint"),
        },
      ],
      pasteLabel: t("settings.info.notion.paste"),
      afterSteps: [{ label: t("settings.info.notion.share"), hint: t("settings.info.notion.shareHint") }],
      howTo: t("settings.info.notion.howTo"),
    },
  };
}
