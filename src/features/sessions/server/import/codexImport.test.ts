import { describe, expect, it } from "vitest";
import { codexHistoryItems } from "@/features/sessions/server/import/codexImport";

describe("codexHistoryItems", () => {
  it("keeps what you typed and the assistant's text, dropping the instructions Codex injects and empty replies", () => {
    const items = codexHistoryItems([
      { type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "<environment_context>cwd</environment_context>" }] } },
      { type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "# AGENTS.md instructions for /repo" }] } },
      { type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "Fix the build" }] } },
      { type: "response_item", payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: "  " }] } },
      { type: "response_item", payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: "Done." }] } },
    ]);
    expect(items).toEqual([
      { kind: "message", text: "Fix the build" },
      { kind: "event", event: { type: "text", text: "Done." } },
    ]);
  });

  it("pairs each tool call with its output by call id, and shows every shell tool as shell", () => {
    const items = codexHistoryItems([
      { type: "response_item", payload: { type: "function_call", name: "exec_command", arguments: '{"cmd":"ls"}', call_id: "c1" } },
      { type: "response_item", payload: { type: "function_call_output", call_id: "c1", output: " a.ts\n" } },
      { type: "response_item", payload: { type: "local_shell_call", call_id: "c2", action: { command: ["pwd"] } } },
      { type: "response_item", payload: { type: "custom_tool_call", name: "apply_patch", input: "*** Begin Patch", call_id: "c3" } },
      { type: "response_item", payload: { type: "custom_tool_call_output", call_id: "c3", output: { ok: true } } },
    ]);
    expect(items).toEqual([
      { kind: "event", event: { type: "tool", name: "shell", detail: '{"cmd":"ls"}', id: "c1" } },
      { kind: "event", event: { type: "tool_result", id: "c1", output: "a.ts", failed: false } },
      { kind: "event", event: { type: "tool", name: "shell", detail: '{"command":["pwd"]}', id: "c2" } },
      { kind: "event", event: { type: "tool", name: "apply_patch", detail: "*** Begin Patch", id: "c3" } },
      { kind: "event", event: { type: "tool_result", id: "c3", output: '{"ok":true}', failed: false } },
    ]);
  });

  it("skips lines that are not conversation: metadata, reasoning, unknown items, and tool calls without an id", () => {
    const items = codexHistoryItems([
      { type: "session_meta", payload: { id: "s1" } },
      { type: "event_msg", payload: { type: "user_message", message: "Fix the build" } },
      { type: "response_item", payload: { type: "reasoning", summary: [] } },
      { type: "response_item", payload: { type: "web_search_call" } },
      { type: "response_item", payload: { type: "function_call", name: "shell", arguments: "{}" } },
      { type: "response_item", payload: "not an object" },
    ]);
    expect(items).toEqual([]);
  });
});
