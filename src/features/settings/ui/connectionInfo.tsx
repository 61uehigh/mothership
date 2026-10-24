import { BookOpen } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { GoogleCalendarIcon, LinearIcon, SlackIcon, type BrandIconProps } from "@/ui/brandIcons";
import type { ConnectionId } from "@/features/settings/model/Settings";

/**
 * ### ConnectionInfo
 *
 * How to set up one tool, shown on its card in Settings.
 */
export type ConnectionInfo = {
  label: string;
  icon: ComponentType<BrandIconProps>;
  /** Label of each `.env.local` variable the MCP server needs. */
  fields: Record<string, { label: string; placeholder: string; kind: "token" | "path" }>;
  /** Where to get the token, shown under the fields. */
  howTo: ReactNode;
};

const LINK = "text-teal-700 underline underline-offset-2 hover:text-teal-600 dark:text-teal-400";

/**
 * ### CONNECTION_INFO
 *
 * Setup notes for each tool in {@link ConnectionId} order.
 */
export const CONNECTION_INFO: Record<ConnectionId, ConnectionInfo> = {
  google_calendar: {
    label: "Google Calendar",
    icon: GoogleCalendarIcon,
    fields: {
      GOOGLE_OAUTH_CREDENTIALS: { label: "OAuth client file", placeholder: "/Users/you/google-oauth-client.json", kind: "path" },
    },
    howTo: (
      <>
        In{" "}
        <a className={LINK} href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">
          Google Cloud
        </a>
        , enable the Calendar API, create a <em>Desktop app</em> OAuth client, add yourself as a test user, and download its JSON. Enter the
        file&apos;s full path above, then sign in once from a terminal:
        <code className="mt-1 block rounded bg-zinc-100 px-2 py-1 font-mono text-[11px] dark:bg-zinc-900">
          GOOGLE_OAUTH_CREDENTIALS=&lt;path&gt; npx @cocal/google-calendar-mcp auth
        </code>
        Test-mode sign-ins expire weekly; run it again when that happens.
      </>
    ),
  },
  slack: {
    label: "Slack",
    icon: SlackIcon,
    fields: { SLACK_USER_TOKEN: { label: "User token", placeholder: "xoxp-…", kind: "token" } },
    howTo: (
      <>
        Create an internal app at{" "}
        <a className={LINK} href="https://api.slack.com/apps" target="_blank" rel="noreferrer">
          api.slack.com/apps
        </a>
        , add the user token scopes you need (<code>search:read</code>, <code>channels:history</code>, <code>chat:write</code>, …), install it to
        your workspace, and paste the <em>User OAuth Token</em>.
      </>
    ),
  },
  linear: {
    label: "Linear",
    icon: LinearIcon,
    fields: { LINEAR_API_KEY: { label: "Personal API key", placeholder: "lin_api_…", kind: "token" } },
    howTo: (
      <>
        Create one in{" "}
        <a className={LINK} href="https://linear.app/settings/account/security" target="_blank" rel="noreferrer">
          Linear → Settings → Security &amp; access
        </a>{" "}
        under Personal API keys.
      </>
    ),
  },
  nuclino: {
    label: "Nuclino",
    icon: BookOpen,
    fields: { NUCLINO_API_KEY: { label: "API key", placeholder: "Nuclino API key", kind: "token" } },
    howTo: <>Create one in Nuclino → your profile settings → API Keys. Revoke it there to disconnect.</>,
  },
};
