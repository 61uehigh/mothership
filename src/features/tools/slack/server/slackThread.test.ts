import { describe, expect, it } from "vitest";
import type { ToolCaller } from "@/platform/mcp/ToolCaller";
import { dmPartner, fetchSlackConversation, parseSlackPermalink } from "@/features/tools/slack/server/slackThread";

// The shape `slack_read_channel` answers with, newest first (from a real call).
const CHANNEL = JSON.stringify({
  messages: [
    "Channel: DM (D1)",
    "",
    "=== Message from Kim <kim@example.com> (U1) at 2026-11-24 19:38:02 KST === ",
    "Message TS: 1795516682.090449",
    "> ㅎㅎ 다행입니닷 ",
    "",
    "=== Message from Me (Changjun) <me@example.com> (U9) at 2026-11-24 19:37:43 KST === ",
    "Message TS: 1795516663.628259",
    "> 11시면 괜찮을 거 같아요",
    "",
    "=== Message from Kim <kim@example.com> (U1) at 2026-11-24 19:37:18 KST === ",
    "Message TS: 1795516638.553029",
    "> 11시 반이나을까요?? ",
  ].join("\n"),
  pagination_info: "There are no more messages.",
});

describe("fetchSlackConversation", () => {
  it("reads the conversation from the oldest grouped message up to the linked one, oldest first", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const caller: ToolCaller = {
      label: "fake",
      describe: async () => undefined,
      callText: async (_tool, args) => {
        calls.push(args);
        return CHANNEL;
      },
    };
    const url = "https://x.slack.com/archives/D1/p1795516682090449";
    const link = parseSlackPermalink(url)!;
    const read = await fetchSlackConversation(caller, url, link, "1795516638.553029", "U9");
    // Slack's bounds leave out their own ends, so each is moved one microsecond out.
    expect(calls).toEqual([{ channel_id: "D1", oldest: "1795516638.553028", latest: "1795516682.090450", limit: 100 }]);
    expect(read.messages.map((m) => [m.ts, m.from, m.markdown.trim()])).toEqual([
      ["1795516638.553029", "Kim", "11시 반이나을까요??"],
      ["1795516663.628259", "Me (Changjun)", "11시면 괜찮을 거 같아요"],
      ["1795516682.090449", "Kim", "ㅎㅎ 다행입니닷"],
    ]);
    expect(read).toMatchObject({ channelId: "D1", focusTs: "1795516682.090449", conversation: true, truncated: false, partner: "Kim" });
  });
});

describe("dmPartner", () => {
  const sent = (from: string, fromId: string | undefined) => ({ message: { ts: "1", from, at: undefined, markdown: "", context: [], reactions: [], files: [] }, fromId });

  it("names the first sender who is not you, only in a DM", () => {
    expect(dmPartner("D1", [sent("Me", "U9"), sent("Linear", "U02EAE9SKC6")], "U9")).toBe("Linear");
    expect(dmPartner("D1", [sent("Me", "U9")], "U9")).toBeUndefined();
    expect(dmPartner("C1", [sent("Kim", "U1")], "U9")).toBeUndefined();
  });
});
