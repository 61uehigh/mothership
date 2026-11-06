/**
 * ### SlackPermission
 *
 * One thing you can let mothership do in Slack, with the user token scopes it needs.
 */
export type SlackPermission = {
  id: string;
  label: string;
  /** Why mothership uses it. */
  detail: string;
  scopes: Array<string>;
  /** Needed for the sidebar to work at all; always included. */
  required?: boolean;
  /** Checked until you change it. */
  recommended?: boolean;
};

/**
 * ### SLACK_PERMISSIONS
 *
 * What the Slack card lets you choose, in the order shown.
 */
export const SLACK_PERMISSIONS: Array<SlackPermission> = [
  {
    id: "search",
    label: "Search messages",
    detail: "The sidebar's mentions and search",
    scopes: ["search:read.public", "search:read.private", "search:read.im", "search:read.mpim", "search:read.users"],
    required: true,
  },
  {
    id: "history",
    label: "Read threads",
    detail: "Opening a thread or conversation",
    scopes: ["channels:history", "groups:history", "im:history", "mpim:history"],
    recommended: true,
  },
  { id: "send", label: "Send as you", detail: "Replies without the “Sent using Claude” line", scopes: ["chat:write"], recommended: true },
  { id: "people", label: "Look up people", detail: "Names and profiles in messages", scopes: ["users:read", "users:read.email"], recommended: true },
  { id: "files", label: "Search files", detail: "Files in search results", scopes: ["search:read.files", "files:read"] },
  { id: "canvases", label: "Canvases", detail: "Reading and editing canvases", scopes: ["canvases:read", "canvases:write"] },
];

/**
 * ### defaultSlackChoice
 *
 * @returns The permission ids checked at first.
 */
export function defaultSlackChoice(): Array<string> {
  return SLACK_PERMISSIONS.filter((p) => p.required === true || p.recommended === true).map((p) => p.id);
}

/**
 * ### slackScopes
 *
 * @param chosen - Permission ids; required ones are added either way.
 * @returns The user token scopes, without repeats, in {@link SLACK_PERMISSIONS} order.
 */
export function slackScopes(chosen: ReadonlyArray<string>): Array<string> {
  const picked = SLACK_PERMISSIONS.filter((p) => p.required === true || chosen.includes(p.id));
  return [...new Set(picked.flatMap((p) => p.scopes))];
}

/**
 * ### slackManifest
 *
 * The app manifest to paste into Slack's "Create New App → From a manifest".
 * It turns on Slack MCP server access (`is_mcp_enabled`), which the token
 * mode needs, and keeps token rotation off so the user token does not expire.
 */
export function slackManifest(chosen: ReadonlyArray<string>): object {
  return {
    display_information: { name: "mothership", description: "Your Slack in mothership: mentions, threads, and replies as you." },
    oauth_config: { scopes: { user: slackScopes(chosen) } },
    settings: { org_deploy_enabled: false, socket_mode_enabled: false, token_rotation_enabled: false, is_mcp_enabled: true },
  };
}

/**
 * ### slackCreateAppUrl
 *
 * @returns A link that opens Slack's new-app dialog with the manifest filled in.
 */
export function slackCreateAppUrl(chosen: ReadonlyArray<string>): string {
  return `https://api.slack.com/apps?new_app=1&manifest_json=${encodeURIComponent(JSON.stringify(slackManifest(chosen)))}`;
}
