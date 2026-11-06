import { describe, expect, it } from "vitest";
import { describeTool } from "@/features/sessions/ui/toolCalls";

const cwd = "/repo";

describe("describeTool", () => {
  it("shows file tools with paths relative to the working folder", () => {
    expect(describeTool("Read", JSON.stringify({ file_path: "/repo/src/a.ts" }), cwd)).toMatchObject({ verb: "Read", target: "src/a.ts" });
    expect(describeTool("Grep", JSON.stringify({ pattern: "export", path: "/repo/src" }), cwd)).toMatchObject({ verb: "Search", target: "export", note: "in src" });
  });

  it("counts edited lines and keeps the diff", () => {
    const call = describeTool("Edit", JSON.stringify({ file_path: "/repo/a.ts", old_string: "a", new_string: "b\nc" }), cwd);
    expect(call).toMatchObject({ verb: "Edit", note: "+2 −1", diff: { before: "a", after: "b\nc" } });
  });

  it("reads shell commands from Claude and Codex", () => {
    expect(describeTool("Bash", JSON.stringify({ command: "pnpm test" }), cwd)).toMatchObject({ verb: "Run", target: "pnpm test" });
    expect(describeTool("shell", "ls src", cwd)).toMatchObject({ verb: "Run", target: "ls src" });
  });

  it("names MCP and connector tools by service", () => {
    expect(describeTool("mcp__claude_ai_Slack__slack_send_message", JSON.stringify({ channel_id: "C1" }), cwd)).toMatchObject({
      verb: "Slack · send message",
      target: "C1",
    });
    expect(describeTool("linear.get_issue", JSON.stringify({ id: "DEV-1" }), cwd)).toMatchObject({ verb: "linear · get issue", target: "DEV-1" });
    expect(describeTool("mcp__mothership__spawn_agent", JSON.stringify({ name: "fixer", role: "code_worker" }), cwd)).toMatchObject({
      verb: "Start sub-agent",
      target: "fixer · code_worker",
    });
  });
});
