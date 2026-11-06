import { describe, expect, it } from "vitest";
import { cleanSlackText, slackCard, slackListsToMarkdown, slackToMarkdown, splitSlackBody, unquoteSlackBody } from "@/features/tools/slack/server/slackFormat";
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

describe("unquoteSlackBody", () => {
  it("takes off the quote the MCP server puts on every line, keeping a quote inside the message", () => {
    expect(unquoteSlackBody("\n> ㅎㅎ 다행입니닷 \n\n")).toBe("\nㅎㅎ 다행입니닷 \n\n");
    expect(unquoteSlackBody("> 아 11시에 초대하셨구나\n> 왜 10시15분이라고 떴지")).toBe("아 11시에 초대하셨구나\n왜 10시15분이라고 떴지");
    expect(unquoteSlackBody("> > quoted\n> reply")).toBe("> quoted\nreply");
    expect(unquoteSlackBody("plain\n> not all quoted")).toBe("plain\n> not all quoted");
  });
});

describe("slackListsToMarkdown", () => {
  it("nests Slack's bullets by their indent, with blank lines around the list", () => {
    // The shape slack_read_thread gives a Daily Scrum post, after unquoting.
    const text = ["*어제 한 일*", "• Safety", "    ◦ 데모 세팅", "• Deeply", "    ◦ Flow 개발", "        ▪\uFE0E 캐싱 #309", "*오늘 할 일*", "• Kit"].join("\n");
    expect(slackListsToMarkdown(text)).toBe(
      ["*어제 한 일*", "", "- Safety", "    - 데모 세팅", "- Deeply", "    - Flow 개발", "        - 캐싱 #309", "", "*오늘 할 일*", "", "- Kit"].join("\n"),
    );
  });

  it("reads tabs and any indent step, and climbs back out to the right level", () => {
    expect(slackListsToMarkdown("1. a\n\t◦ b\n\t\t▪ c\n  ◦ d\n2. e")).toBe("1. a\n    - b\n        - c\n    - d\n2. e");
  });

  it("leaves code blocks and dashes without a space alone", () => {
    const code = "```\n  • not a list\n```";
    expect(slackListsToMarkdown(code)).toBe(code);
    expect(slackListsToMarkdown("---\n-5 degrees")).toBe("---\n-5 degrees");
  });

  it("renders as a nested Markdown list through slackToMarkdown", () => {
    expect(slackToMarkdown("• A\n    ◦ B <https://x.example/1|#1>")).toBe("- A  \n    - B [#1](https://x.example/1)");
  });
});

describe("slackCard", () => {
  it("reads a Work Object such as Linear's issue preview", () => {
    const message = {
      metadata: {
        entities: [
          {
            entity_type: "slack#/entities/task",
            url: "https://linear.app/x/issue/DEV-2344",
            entity_payload: {
              attributes: { title: { text: "소음 MQTT 본문의 마이크 ID 중복 제거" }, display_type: "Issue", display_id: "DEV-2344", product_name: "Linear" },
              fields: { status: { value: "In Progress" }, assignee: { type: "slack#/types/user", user: { user_id: "U9" } }, description: { value: "long" } },
              custom_fields: [{ key: "project", label: "Project", value: "Safety Product", type: "string" }],
            },
          },
        ],
      },
    };
    expect(slackCard(message)).toEqual({
      text: [
        "*<https://linear.app/x/issue/DEV-2344|소음 MQTT 본문의 마이크 ID 중복 제거>*",
        "Issue DEV-2344 · Linear",
        "*Status:* In Progress",
        "*Assignee:* <@U9>",
        "*Project:* Safety Product",
      ].join("\n"),
      context: [],
    });
    expect(slackToMarkdown(slackCard(message).text, "U9")).toContain("**[소음 MQTT 본문의 마이크 ID 중복 제거](https://linear.app/x/issue/DEV-2344)**");
  });

  it("quotes attachment text, moves footers and context to the muted line, and skips buttons", () => {
    const message = {
      attachments: [
        { title: "DEV-1 Fix", title_link: "https://l.example/1", text: "한 번 더 확인해보겠습니다", fields: [{ title: "Status", value: "Done" }], footer: "Linear" },
        { fallback: "a link preview" },
      ],
      blocks: [
        { type: "header", text: { type: "plain_text", text: "Deploy" } },
        { type: "section", text: { type: "mrkdwn", text: "Shipped" }, fields: [{ type: "mrkdwn", text: "*Env:* prod" }] },
        { type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "Reply" } }] },
        { type: "context", elements: [{ type: "mrkdwn", text: "deeplyinc/web#6" }, { type: "image", image_url: "x" }, { type: "plain_text", text: "65 files" }] },
      ],
    };
    expect(slackCard(message)).toEqual({
      text: "*<https://l.example/1|DEV-1 Fix>*\n\n> 한 번 더 확인해보겠습니다\n\n*Status:* Done\n\na link preview\n\n*Deploy*\nShipped\n*Env:* prod",
      context: ["Linear", "deeplyinc/web#6", "65 files"],
    });
    expect(slackToMarkdown(slackCard(message).text)).toContain("\n\n> 한 번 더 확인해보겠습니다\n\n");
  });

  it("is empty when nothing reads as text", () => {
    expect(slackCard({})).toEqual({ text: "", context: [] });
    expect(slackCard({ attachments: [{ image_url: "x" }], blocks: [{ type: "divider" }], metadata: { event_type: "x" } }).text).toBe("");
  });
});

describe("splitSlackBody", () => {
  // Linear's messages as slack_read_channel flattens them, after unquoting.
  it("drops an app's buttons and moves its pull request footer to the muted line", () => {
    expect(splitSlackBody("<@U1|Kim> commented on <https://l.example|DEV-1>\n<@U9|Me> 넵\nReply button", true)).toEqual({
      text: "<@U1|Kim> commented on <https://l.example|DEV-1>\n<@U9|Me> 넵",
      context: [],
    });
    expect(splitSlackBody("requested changes\n리뷰했습니다.\ndeeplyinc/deeply-website-frontend#6\n65 files / ≈ +1002 -880\n", true)).toEqual({
      text: "requested changes\n리뷰했습니다.",
      context: ["deeplyinc/deeply-website-frontend#6", "65 files / ≈ +1002 -880"],
    });
  });

  it("turns `Attachment:` into a quote, for anyone", () => {
    expect(splitSlackBody(":+1: Kim reacted to your comment\nAttachment: 한 번 더 확인해보겠습니다", true).text).toBe(
      ":+1: Kim reacted to your comment\n\n> 한 번 더 확인해보겠습니다",
    );
  });

  it("leaves people's lines about buttons and repos alone", () => {
    const text = "Press the submit button\nowner/repo#6";
    expect(splitSlackBody(text, false)).toEqual({ text, context: [] });
  });
});
