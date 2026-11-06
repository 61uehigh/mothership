import { describe, expect, it } from "vitest";
import { describeTool } from "@/features/sessions/ui/toolCalls";
import { translator } from "@/ui/i18n/translate";

const cwd = "/repo";
const t = translator("en");

describe("describeTool", () => {
  it("counts edited lines and keeps the diff", () => {
    const call = describeTool("Edit", JSON.stringify({ file_path: "/repo/a.ts", old_string: "a", new_string: "b\nc" }), cwd, t);
    expect(call).toMatchObject({ verb: "Edit", note: "+2 −1", diff: { before: "a", after: "b\nc" } });
  });

  it("shows paths inside a Windows session folder relative to it", () => {
    const call = describeTool("Read", JSON.stringify({ file_path: "C:\\Users\\me\\repo\\src\\a.ts" }), "C:\\Users\\me\\repo", t);
    expect(call.target).toBe("src\\a.ts");
  });

  it("names MCP and connector tools by service", () => {
    expect(describeTool("mcp__claude_ai_Slack__slack_send_message", JSON.stringify({ channel_id: "C1" }), cwd, t)).toMatchObject({
      verb: "Slack · send message",
      target: "C1",
    });
    expect(describeTool("linear.get_issue", JSON.stringify({ id: "DEV-1" }), cwd, t)).toMatchObject({ verb: "linear · get issue", target: "DEV-1" });
    expect(describeTool("mcp__mothership__spawn_agent", JSON.stringify({ name: "fixer", role: "code_worker" }), cwd, t)).toMatchObject({
      verb: "Start sub-agent",
      target: "fixer · code_worker",
    });
  });
});
