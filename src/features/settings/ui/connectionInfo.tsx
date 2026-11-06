import { BookOpen, NotebookText } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { GoogleCalendarIcon, LinearIcon, SlackIcon, type BrandIconProps } from "@/ui/brandIcons";
import type { ConnectionId } from "@/features/settings/model/Settings";

/**
 * ### TokenStep
 *
 * One step of making a tool's token, with a link to the exact page.
 *
 * @param hint - Where to click on that page; shown as the step's tooltip and under Details.
 */
export type TokenStep = { label: string; link?: { href: string; label: string }; hint?: string };

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
 * ### CONNECTION_INFO
 *
 * Setup notes for each tool in {@link ConnectionId} order.
 */
export const CONNECTION_INFO: Record<ConnectionId, ConnectionInfo> = {
  google_calendar: {
    label: "Google Calendar",
    icon: GoogleCalendarIcon,
    description: "Today's meetings in the sidebar, and your calendar for agents.",
    fields: {},
    setup: "google",
  },
  slack: {
    label: "Slack",
    icon: SlackIcon,
    description: "Your mentions and DMs in the sidebar; reply and react as you.",
    fields: { SLACK_USER_TOKEN: { label: "User OAuth Token", placeholder: "xoxp-…" } },
    setup: "slack",
    withConnector: "Post without the “Sent using Claude” line",
  },
  linear: {
    label: "Linear",
    icon: LinearIcon,
    description: "Your assigned issues in the sidebar; agents can read and update them.",
    fields: { LINEAR_API_KEY: { label: "Personal API key", placeholder: "lin_api_…" } },
    tokenSteps: [
      {
        label: "Create a personal API key",
        link: { href: "https://linear.app/settings/account/security", label: "Open Linear" },
        hint: "Personal API keys → New API key",
      },
    ],
    pasteLabel: "Paste the key",
    howTo: (
      <>
        Under <strong className="font-medium">Personal API keys</strong>, click <strong className="font-medium">New API key</strong>. <em>Read</em> is enough
        for the sidebar; add <em>Write</em> if agents should create or update issues.
      </>
    ),
  },
  nuclino: {
    label: "Nuclino",
    icon: BookOpen,
    description: "Search your Nuclino workspace and summarize meeting notes.",
    fields: { NUCLINO_API_KEY: { label: "API key", placeholder: "Nuclino API key" } },
    tokenSteps: [
      {
        label: "Create an API key",
        link: { href: "https://app.nuclino.com", label: "Open Nuclino" },
        hint: "Your avatar → Profile settings → API keys → Create API key",
      },
    ],
    pasteLabel: "Paste the key",
    howTo: (
      <>
        Click your avatar → <strong className="font-medium">Profile settings</strong> → <strong className="font-medium">API keys</strong> →{" "}
        <strong className="font-medium">Create API key</strong>. It can read and edit what you can; revoke it there to disconnect.
      </>
    ),
  },
  notion: {
    label: "Notion",
    icon: NotebookText,
    description: "Search your Notion pages; agents can read and edit them.",
    fields: { NOTION_TOKEN: { label: "Internal integration secret", placeholder: "ntn_…" } },
    tokenSteps: [
      {
        label: "Create an internal integration",
        link: { href: "https://www.notion.so/profile/integrations", label: "Open Notion" },
        hint: "New integration → type Internal → copy the secret",
      },
    ],
    pasteLabel: "Paste its secret",
    afterSteps: [{ label: "Share pages with it", hint: "A page's ⋯ menu → Connections → your integration" }],
    howTo: (
      <>
        <strong className="font-medium">New integration</strong> → type <em>Internal</em> → copy the secret. Give it <em>Read content</em> (add{" "}
        <em>Update</em> and <em>Insert</em> to let agents edit), then share pages with it from a page&apos;s ⋯ menu → Connections.
      </>
    ),
  },
};
