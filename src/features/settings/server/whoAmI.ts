import type { ConnectionId } from "@/features/settings/model/Settings";

const TIMEOUT_MS = 8_000;

async function json(url: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) return undefined;
  return response.json();
}

/** Reads a string at `path` in a JSON value, or `undefined`. */
function pick(value: unknown, ...path: Array<string>): string | undefined {
  let current = value;
  for (const key of path) {
    if (typeof current !== "object" || current === null || !(key in current)) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" && current !== "" ? current : undefined;
}

const WHO: Partial<Record<ConnectionId, (token: string) => Promise<string | undefined>>> = {
  slack: async (token) => {
    const body = await json("https://slack.com/api/auth.test", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    const user = pick(body, "user");
    const team = pick(body, "team");
    return user === undefined ? undefined : team === undefined ? user : `${user} · ${team}`;
  },
  linear: async (token) => {
    const body = await json("https://api.linear.app/graphql", {
      method: "POST",
      headers: { Authorization: token, "Content-Type": "application/json" },
      body: JSON.stringify({ query: "{ viewer { name organization { name } } }" }),
    });
    const name = pick(body, "data", "viewer", "name");
    const org = pick(body, "data", "viewer", "organization", "name");
    return name === undefined ? undefined : org === undefined ? name : `${name} · ${org}`;
  },
  notion: async (token) => {
    const body = await json("https://api.notion.com/v1/users/me", { headers: { Authorization: `Bearer ${token}`, "Notion-Version": "2022-06-28" } });
    const bot = pick(body, "name");
    const workspace = pick(body, "bot", "workspace_name");
    return bot === undefined ? undefined : workspace === undefined ? bot : `${bot} · ${workspace}`;
  },
};

/** Each tool's token variable, for {@link whoAmI}. */
const TOKEN: Partial<Record<ConnectionId, string>> = { slack: "SLACK_USER_TOKEN", linear: "LINEAR_API_KEY", notion: "NOTION_TOKEN" };

/**
 * ### whoAmI
 *
 * Asks the tool who the saved token belongs to. The token is sent only to
 * the tool's own API and never returned.
 *
 * @returns e.g. `Ada · Acme`, or `undefined` when the tool has no such call, no token is set, or it fails.
 */
export async function whoAmI(id: ConnectionId): Promise<string | undefined> {
  const ask = WHO[id];
  const token = process.env[TOKEN[id] ?? ""] ?? "";
  if (ask === undefined || token === "") return undefined;
  return ask(token).catch(() => undefined);
}
