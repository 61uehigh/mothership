import { describe, expect, it } from "vitest";
import { fetchSlackInbox, mergeSlackInbox, parseSlackSearch, type SlackSearchHit } from "@/features/tools/slack/server/slackSource";
import type { ToolCaller } from "@/platform/mcp/ToolCaller";

const ME = "UME";

function message(fields: Partial<SlackSearchHit> & Pick<SlackSearchHit, "permalink" | "at">): SlackSearchHit {
  return { channel: "#dev", from: "Kim", fromId: "U1", ts: undefined, text: "hello", markup: "hello", broadcast: false, ...fields };
}

describe("parseSlackSearch", () => {
  it("notes @here and @channel before the markup is cleaned away", () => {
    const results = [
      "### Result 1 of 2\nChannel: #general (ID: C1)\nFrom: Kim (ID: U1)\nMessage_ts: 1700000000.000100\nText: \n<!here> lunch is here\n\n---\n",
      "### Result 2 of 2\nChannel: DM (ID: D1)\nFrom: Printer (ID: U2)\nMessage_ts: 1700000000.000200\nText: \nprint at here\n\n---\n",
    ].join("");
    const parsed = parseSlackSearch(JSON.stringify({ results }));
    expect(parsed.map((m) => [m.text, m.broadcast])).toEqual([
      ["@here lunch is here", true],
      ["print at here", false],
    ]);
  });
});

describe("parseSlackSearch quoting", () => {
  it("reads the text without the quote the MCP server puts on it", () => {
    const results = "### Result 1 of 1\nChannel: DM (ID: D1)\nFrom: Kim (ID: U1)\nMessage_ts: 1795516682.090449\nText: \n> ㅎㅎ 다행입니닷 \n\n---\n";
    expect(parseSlackSearch(JSON.stringify({ results })).map((m) => m.text)).toEqual(["ㅎㅎ 다행입니닷"]);
  });
});

describe("mergeSlackInbox", () => {
  it("tags each message with why it is listed and counts a message once", () => {
    const items = mergeSlackInbox(
      {
        mentions: [
          message({ permalink: "p/mention", at: 3, channel: "#dev" }),
          // A DM that mentions you is found by both searches; it is a DM.
          message({ permalink: "p/dm-mention", at: 2, channel: "DM with Kim" }),
        ],
        dms: [message({ permalink: "p/dm-mention", at: 2, channel: "DM with Kim" }), message({ permalink: "p/dm", at: 1, channel: "DM" })],
        groups: [
          message({ permalink: "p/here", at: 4, channel: "#general", broadcast: true }),
          // The @here search also found your mention; the mention wins.
          message({ permalink: "p/mention", at: 3, channel: "#dev", broadcast: true }),
          // A loose search hit without a real @here is left out.
          message({ permalink: "p/loose", at: 5, channel: "#random", broadcast: false }),
        ],
      },
      ME,
    );
    expect(items.map((i) => [i.id, i.slack?.reason, i.slack?.channel])).toEqual([
      ["p/here", "group", "#general"],
      ["p/mention", "mention", "#dev"],
      ["p/dm-mention", "dm", "DM"],
      ["p/dm", "dm", "DM"],
    ]);
  });

  it("keys each message by its conversation: the channel, plus the thread if any", () => {
    const items = mergeSlackInbox(
      {
        mentions: [message({ permalink: "https://x.slack.com/archives/C1/p1792666630670179?thread_ts=1785899809.224029&cid=C1", at: 2, channel: "#dev" })],
        dms: [message({ permalink: "https://x.slack.com/archives/D9/p1792666630670180", at: 1, channel: "DM" })],
        groups: [],
      },
      ME,
    );
    expect(items.map((i) => i.slack?.conversation)).toEqual(["C1:1785899809.224029", "D9"]);
  });

  it("drops your own messages", () => {
    const own = message({ permalink: "p/own", at: 1, fromId: ME, channel: "DM" });
    expect(mergeSlackInbox({ mentions: [own], dms: [own], groups: [] }, ME)).toEqual([]);
  });
});

describe("fetchSlackInbox", () => {
  const render = (list: Array<{ id: string; channel: string; text: string }>) =>
    JSON.stringify({
      results: list
        .map((m, i) => `### Result ${i + 1} of ${list.length}\nChannel: ${m.channel}\nFrom: Kim (ID: U1)\nMessage_ts: 17000000${i}0.000000\nPermalink: [link](https://x.slack.com/${m.id})\nText: \n${m.text}\n\n---\n`)
        .join(""),
    });

  function fakeCaller(calls: Array<Record<string, unknown>>): ToolCaller {
    return {
      label: "fake",
      describe: async () => undefined,
      callText: async (_tool, args) => {
        calls.push(args);
        const keywords = (args.keywords as Array<string> | undefined) ?? [];
        if (args.filters === "is:dm") return render([{ id: "dm", channel: "DM (ID: D1)", text: "hi" }]);
        if (keywords[0] === `<@${ME}>`) return render([{ id: "mention", channel: "#dev (ID: C1)", text: `<@${ME}> look` }]);
        if (keywords[0] === "<!here>") throw new Error("ratelimited");
        return render([{ id: "channel", channel: "#general (ID: C2)", text: "<!channel> notice" }]);
      },
    };
  }

  it("searches mentions and DMs separately, each up to the limit", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const items = await fetchSlackInbox(fakeCaller(calls), { lookbackHours: 24, limit: 5, userId: ME, groupMentions: false }, Date.now());
    expect(calls).toHaveLength(2);
    expect(calls.every((c) => c.limit === 5)).toBe(true);
    expect(items.map((i) => i.slack?.reason).sort()).toEqual(["dm", "mention"]);
  });

  it("adds @here / @channel when asked, and a failed one leaves the rest", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const items = await fetchSlackInbox(fakeCaller(calls), { lookbackHours: 24, limit: 5, userId: ME, groupMentions: true }, Date.now());
    expect(calls).toHaveLength(4);
    expect(items.map((i) => i.slack?.reason).sort()).toEqual(["dm", "group", "mention"]);
  });
});
