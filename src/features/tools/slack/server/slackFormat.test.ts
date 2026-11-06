import { describe, expect, it } from "vitest";
import { cleanSlackText, slackToMarkdown } from "@/features/tools/slack/server/slackFormat";
import { parseSlackPermalink } from "@/features/tools/slack/server/slackThread";

describe("slackToMarkdown", () => {
  it("marks your mentions and others' differently, counting @here as yours", () => {
    const text = "hi <@U1|Kim> and <@ME|Me>";
    expect(slackToMarkdown(text, "ME")).toBe("hi [@Kim](mention:other) and [@Me](mention:me)");
    expect(slackToMarkdown("<!here> deploy", "ME")).toContain("[@here](mention:me)");
  });

  it("turns labelled links into Markdown links and keeps line breaks", () => {
    expect(slackToMarkdown("see <https://a.example|docs>\nnext")).toBe("see [docs](https://a.example)  \nnext");
  });
});

describe("cleanSlackText", () => {
  it("flattens markup to one line of plain text", () => {
    expect(cleanSlackText("<@U1|Kim> see <https://a.example|docs>\n<#C1|general>")).toBe("@Kim see docs #general");
  });
});

describe("parseSlackPermalink", () => {
  it("reads the channel, message ts, and thread ts", () => {
    expect(parseSlackPermalink("https://x.slack.com/archives/C7553PRU0/p1792666630670179?thread_ts=1785899809.224029&cid=C7553PRU0")).toEqual({
      channelId: "C7553PRU0",
      ts: "1792666630.670179",
      threadTs: "1785899809.224029",
    });
  });

  it("rejects links that are not Slack messages", () => {
    expect(parseSlackPermalink("https://evil.example/archives/C1/p1792666630670179")).toBeUndefined();
    expect(parseSlackPermalink("not a url")).toBeUndefined();
  });
});
