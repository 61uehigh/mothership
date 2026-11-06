import { describe, expect, it } from "vitest";
import { parseTab } from "@/shell/tabs";

describe("parseTab", () => {
  it("keeps a saved tab of a kind this version draws, with optional fields", () => {
    expect(parseTab({ kind: "agent-limits" })).toEqual({ kind: "agent-limits" });
    expect(parseTab({ kind: "file", root: "workspace", path: "src/a.ts", line: 4 })).toEqual({ kind: "file", root: "workspace", path: "src/a.ts", line: 4 });
  });

  it.each([
    ["a removed kind", { kind: "dashboard" }],
    ["a removed section", { kind: "section", section: "jira" }],
    ["a missing field", { kind: "session" }],
    ["an empty id", { kind: "session", agentId: "" }],
    ["a malformed repo", { kind: "pr", repo: "no-slash", number: 1 }],
    ["a line that is not a positive whole number", { kind: "file", root: "workspace", path: "a.ts", line: 0 }],
    ["a Slack start that is not a ts", { kind: "slack", url: "https://x.slack.com/archives/C/p1", title: "", since: "yesterday" }],
    ["not an object", "inbox"],
  ])("drops %s", (_what, saved) => {
    expect(parseTab(saved)).toBeUndefined();
  });
});
