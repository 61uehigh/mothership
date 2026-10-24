#!/usr/bin/env node
// Demo MCP server that imitates the tools mothership's dashboard calls, with
// made-up data and the same response formats as the real servers. Lets the
// dashboard run without any API keys: see config/mcp.demo.yaml.
//
// Usage: node scripts/demo-mcp.mjs <calendar|linear|slack|nuclino>

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const kind = process.argv[2];
const HOUR = 3_600_000;
const now = Date.now();
const text = (value) => ({ content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value) }] });
const matches = (query, ...fields) => fields.some((f) => f?.toLowerCase().includes(String(query).toLowerCase()));

const server = new McpServer({ name: `demo-${kind}`, version: "0.0.0" });

if (kind === "calendar") {
  // Times are relative to now so there is always a meeting in progress and a next one.
  const at = (offsetHours) => new Date(now + offsetHours * HOUR).toISOString();
  const events = [
    { id: "ev-standup", summary: "Daily standup", start: { dateTime: at(-3) }, end: { dateTime: at(-2.75) } },
    { id: "ev-review", summary: "Firmware release review", location: "Room B", start: { dateTime: at(-0.25) }, end: { dateTime: at(0.5) }, hangoutLink: "https://meet.google.com/demo-abcd-efg" },
    { id: "ev-1on1", summary: "1:1 (demo)", start: { dateTime: at(1.5) }, end: { dateTime: at(2) }, description: "Quarterly goals check-in" },
    { id: "ev-allday", summary: "On-site visit (demo)", start: { date: new Date(now).toISOString().slice(0, 10) }, end: { date: new Date(now + 24 * HOUR).toISOString().slice(0, 10) } },
  ].map((e) => ({ ...e, htmlLink: `https://calendar.google.com/calendar/event?eid=${e.id}`, status: "confirmed" }));

  server.registerTool("list-events", { inputSchema: { calendarId: z.any(), timeMin: z.string().optional(), timeMax: z.string().optional(), timeZone: z.string().optional() } }, async () =>
    text({ events, totalCount: events.length }),
  );
  server.registerTool("search-events", { inputSchema: { calendarId: z.any(), query: z.string(), timeMin: z.string(), timeMax: z.string(), timeZone: z.string().optional() } }, async ({ query }) => {
    const found = events.filter((e) => matches(query, e.summary, e.description, e.location));
    return text({ events: found, totalCount: found.length });
  });
}

if (kind === "linear") {
  const issues = [
    { id: "DEMO-12", title: "Dashboard intermittently freezes after deploy", status: "In Progress", statusType: "started", priority: { value: 1, name: "Urgent" }, team: "Platform", dueDate: null, updatedAt: new Date(now - 2 * HOUR).toISOString() },
    { id: "DEMO-9", title: "Clean up settings page permissions", status: "In Progress", statusType: "started", priority: { value: 3, name: "Medium" }, team: "Platform", dueDate: new Date(now - 48 * HOUR).toISOString().slice(0, 10), updatedAt: new Date(now - 30 * HOUR).toISOString() },
    { id: "DEMO-21", title: "Document the log collection pipeline", status: "Todo", statusType: "unstarted", priority: { value: 2, name: "High" }, team: "Data", dueDate: null, updatedAt: new Date(now - 72 * HOUR).toISOString() },
    { id: "DEMO-23", title: "Update the onboarding checklist", status: "Todo", statusType: "unstarted", priority: { value: 4, name: "Low" }, team: "Ops", dueDate: null, updatedAt: new Date(now - 100 * HOUR).toISOString() },
  ].map((i) => ({ ...i, url: `https://linear.app/demo/issue/${i.id}` }));

  server.registerTool("list_issues", { inputSchema: { assignee: z.string().optional(), state: z.string().optional(), query: z.string().optional(), limit: z.number().optional(), orderBy: z.string().optional(), fields: z.array(z.string()).optional() } }, async ({ state, query, limit }) => {
    const found = issues
      .filter((i) => state === undefined || i.statusType === state || i.status === state)
      .filter((i) => query === undefined || matches(query, i.title))
      .slice(0, limit ?? 50);
    return text({ issues: found, hasNextPage: false });
  });
}

if (kind === "slack") {
  const me = "U0DEMO0ME";
  const kst = (epochMs) => `${new Date(epochMs + 9 * HOUR).toISOString().slice(0, 19).replace("T", " ")} KST`;
  const messages = [
    { channel: "#dev-platform (ID: C0DEMO1)", from: "Alex Kim <kim@example.com> (ID: U0DEMO1)", at: now - 0.5 * HOUR, text: `<@${me}|me> Could you take a look at <https://linear.app/demo/issue/DEMO-12|DEMO-12> before the release review?`, mention: true },
    { channel: "DM (ID: D0DEMO2)", from: "Sam Lee <lee@example.com> (ID: U0DEMO2)", at: now - 1.2 * HOUR, text: "Could we push today's 1:1 back 30 minutes?", dm: true },
    { channel: "DM (ID: D0DEMO2)", from: "Me <me@example.com> (ID: U0DEMO0ME)", at: now - 1.1 * HOUR, text: "Sure, that works", dm: true },
    { channel: "#announcements (ID: C0DEMO3)", from: "Jordan Park <park@example.com> (ID: U0DEMO3)", at: now - 20 * HOUR, text: `<!here> <@${me}> Sharing the materials for next week's workshop.\nThis is an example of a multi-line message.`, mention: true },
  ];
  const render = (list) =>
    `# Search Results for: \n\n## Messages (${list.length} results)\n` +
    list
      .map((m, i) => `### Result ${i + 1} of ${list.length}\nChannel: ${m.channel}\nFrom: ${m.from} \nTime: ${kst(m.at)}\nMessage_ts: ${(m.at / 1000).toFixed(6)}\nPermalink: [link](https://demo.slack.com/archives/X/p${Math.floor(m.at)})\nText: \n${m.text}\n\n---\n\n`)
      .join("");

  server.registerTool(
    "slack_search_public_and_private",
    {
      description: `Searches for messages in ALL Slack channels. Current logged in user's user_id is ${me}. (demo)`,
      inputSchema: { keywords: z.array(z.string()).optional(), filters: z.string().optional(), after: z.string().optional(), limit: z.number().optional(), sort: z.string().optional(), include_context: z.boolean().optional(), natural_language_query: z.string().optional() },
    },
    async ({ keywords = [], filters = "", after, limit = 20 }) => {
      const found = messages
        .filter((m) => after === undefined || m.at / 1000 >= Number(after))
        .filter((m) => !filters.includes("is:dm") || m.dm)
        // Real Slack search matches `<@U1>` against `<@U1|Name>` too.
        .filter((m) => keywords.every((k) => m.text.includes(k.replace(/>$/, ""))))
        .slice(0, limit);
      return text({ results: render(found), pagination_info: "" });
    },
  );
}

if (kind === "nuclino") {
  const workspaces = [
    { id: "00000000-0000-4000-8000-000000000001", teamId: "00000000-0000-4000-8000-0000000000aa", name: "Dev" },
    { id: "00000000-0000-4000-8000-000000000002", teamId: "00000000-0000-4000-8000-0000000000aa", name: "Product" },
  ];
  const item = (n, workspace, title, hoursAgo) => ({ type: "item", id: `00000000-0000-4000-9000-00000000000${n}`, workspaceId: workspace.id, title, createdAt: new Date(now - 500 * HOUR).toISOString(), lastUpdatedAt: new Date(now - hoursAgo * HOUR).toISOString(), fields: {} });
  const items = [
    item(1, workspaces[0], "Release checklist (demo)", 3),
    item(2, workspaces[1], "Weekly product meeting notes (demo)", 26),
    item(3, workspaces[0], "On-call runbook (demo)", 80),
    { type: "collection", id: "00000000-0000-4000-9000-000000000009", workspaceId: workspaces[0].id, title: "Guides", lastUpdatedAt: new Date(now).toISOString() },
  ];

  server.registerTool("list_workspaces", { inputSchema: { limit: z.number().optional() } }, async () => text(JSON.stringify(workspaces, null, 2)));
  server.registerTool("list_items", { inputSchema: { workspaceId: z.string().optional(), limit: z.number().optional() } }, async ({ workspaceId }) =>
    text(JSON.stringify(items.filter((i) => i.workspaceId === workspaceId), null, 2)),
  );
  server.registerTool("search_items", { inputSchema: { workspaceId: z.string().optional(), query: z.string(), limit: z.number().optional() } }, async ({ workspaceId, query }) =>
    text(JSON.stringify(items.filter((i) => i.workspaceId === workspaceId && matches(query, i.title)), null, 2)),
  );
}

await server.connect(new StdioServerTransport());
