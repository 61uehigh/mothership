import { describe, expect, it } from "vitest";
import { fetchNotionPage, fromNotionMarkdown } from "@/features/tools/notion/server/notionPage";
import { fetchRecentNotion, searchNotion } from "@/features/tools/notion/server/notionSource";
import { ToolNotFoundError, type ToolCaller } from "@/platform/mcp/ToolCaller";

const PAGE_ID = "32551b7d-cd10-8361-8d59-8135896e35ca";

function fakeCaller(label: string, answers: Record<string, unknown>): ToolCaller & { calls: Array<[string, Record<string, unknown>]> } {
  const calls: Array<[string, Record<string, unknown>]> = [];
  return {
    label,
    calls,
    async callText(tool: string, args: Record<string, unknown>) {
      calls.push([tool, args]);
      const answer = answers[tool];
      if (answer === undefined) throw new Error(`unexpected ${tool}`);
      return typeof answer === "string" ? answer : JSON.stringify(answer);
    },
    describe: async () => undefined,
  };
}

// Shaped like real Notion API objects (trimmed).
const apiPage = (id: string, title: string, edited: string) => ({
  object: "page",
  id,
  url: `https://www.notion.so/${title.replace(/ /g, "-")}-${id.replace(/-/g, "")}`,
  last_edited_time: edited,
  in_trash: false,
  properties: { Name: { id: "title", type: "title", title: [{ plain_text: title }] }, Status: { id: "x", type: "status" } },
});

describe("fetchRecentNotion", () => {
  it("lists pages through the token server, most recently edited first as Notion sorts them", async () => {
    const caller = fakeCaller("mcp:notion", {
      "API-post-search": { object: "list", results: [apiPage(PAGE_ID, "Roadmap", "2026-11-01T09:00:00.000Z"), { object: "data_source", id: "ds" }] },
    });
    const items = await fetchRecentNotion(caller, { limit: 5 });
    expect(items.map((i) => [i.title, i.at])).toEqual([["Roadmap", Date.parse("2026-11-01T09:00:00.000Z")]]);
    expect(items[0].url).toContain(PAGE_ID.replace(/-/g, ""));
    expect(caller.calls[0][1]).toMatchObject({ sort: { timestamp: "last_edited_time" }, page_size: 5 });
  });

  it("lists recently viewed pages through the claude.ai connector, skipping databases", async () => {
    const caller = fakeCaller("connector:Notion", {
      "notion-list-recent-pages": { results: [{ id: PAGE_ID, title: "1:1 notes", url: "https://app.notion.com/p/x", type: "page" }, { id: "db", title: "Tasks", type: "database" }] },
    });
    expect((await fetchRecentNotion(caller, { limit: 5 })).map((i) => i.title)).toEqual(["1:1 notes"]);
  });

  it("turns Notion's error answer into an error", async () => {
    const caller = fakeCaller("mcp:notion", { "API-post-search": { status: "error", object: "error", code: "unauthorized", message: "API token is invalid." } });
    await expect(fetchRecentNotion(caller, { limit: 5 })).rejects.toThrow("API token is invalid.");
  });
});

describe("searchNotion", () => {
  it("searches through the connector without highlights", async () => {
    const caller = fakeCaller("connector:Notion", { "notion-search": { results: [{ id: PAGE_ID, title: "1:1 notes", type: "page", timestamp: "2026-09-29T07:07:00.000Z" }] } });
    expect((await searchNotion(caller, "1:1")).map((i) => i.title)).toEqual(["1:1 notes"]);
    expect(caller.calls[0][1]).toMatchObject({ query: "1:1", max_highlight_length: 0 });
  });
});

describe("fetchNotionPage", () => {
  it("reads the page and its Markdown through the token server", async () => {
    const caller = fakeCaller("mcp:notion", {
      "API-retrieve-a-page": apiPage(PAGE_ID, "Roadmap", "2026-11-01T09:00:00.000Z"),
      "API-retrieve-page-markdown": { object: "page_markdown", id: PAGE_ID, markdown: "# Plan\n<callout icon=\"💡\">\nShip it\n</callout>", truncated: false },
    });
    const page = await fetchNotionPage(caller, PAGE_ID);
    expect(page).toMatchObject({ id: PAGE_ID, title: "Roadmap", markdown: "# Plan\n> Ship it", truncated: false });
  });

  it("reports a page the integration cannot see as not found", async () => {
    const missing = { status: "error", object: "error", code: "object_not_found", message: "Could not find page with ID." };
    const caller = fakeCaller("mcp:notion", { "API-retrieve-a-page": missing, "API-retrieve-page-markdown": missing });
    await expect(fetchNotionPage(caller, PAGE_ID)).rejects.toBeInstanceOf(ToolNotFoundError);
  });

  it("reads the content out of the connector's fetch answer", async () => {
    const caller = fakeCaller("connector:Notion", {
      "notion-fetch": {
        metadata: { type: "page" },
        title: "1:1 notes",
        url: "https://app.notion.com/p/32551b7dcd1083618d598135896e35ca",
        text: 'Here is the result:\n<page url="x">\n<properties>\n{"title":"1:1 notes"}\n</properties>\n<content>\nHello <span color="gray">there</span>\n</content>\n</page>',
        truncated: true,
        page_last_edited_at: "2026-09-29T07:07:43.522Z",
      },
    });
    const page = await fetchNotionPage(caller, PAGE_ID);
    expect(page).toMatchObject({ title: "1:1 notes", markdown: "Hello there", truncated: true, updatedAt: Date.parse("2026-09-29T07:07:43.522Z") });
  });
});

describe("fromNotionMarkdown", () => {
  it("rewrites toggles, lists, mentions, and attributes as plain Markdown", () => {
    const input = [
      "<details>",
      "<summary>Agenda {color=\"gray\"}</summary>",
      "- Talking points",
      "  <ul>",
      "  <li>Hiring with <mention-user url=\"user://1\">Jane Doe</mention-user></li>",
      "  <li></li>",
      "  </ul>",
      "</details>",
      "See <mention-page url=\"https://www.notion.so/abc\">Roadmap</mention-page> by <mention-date start=\"2026-11-10\"/>.",
      "Heading line {color=\"blue_bg\"}",
      "<p />",
      "<unknown url=\"x\" alt=\"button\"/>",
      "```",
      "<keep this>",
      "```",
    ].join("\n");
    expect(fromNotionMarkdown(input)).toBe(
      [
        "**Agenda**",
        "- Talking points",
        "  - Hiring with @Jane Doe",
        "See [Roadmap](https://www.notion.so/abc) by 2026-11-10.",
        "Heading line",
        "",
        "```",
        "<keep this>",
        "```",
      ].join("\n"),
    );
  });

  it("turns an HTML table into a pipe table", () => {
    const input = '<table header-row="true">\n<tr>\n<td>Name</td>\n<td>Owner</td>\n</tr>\n<tr>\n<td>Launch</td>\n<td>A | B</td>\n</tr>\n</table>';
    expect(fromNotionMarkdown(input)).toBe("| Name | Owner |\n| --- | --- |\n| Launch | A \\| B |");
  });
});
