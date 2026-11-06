import { describe, expect, it } from "vitest";
import { claudeAuthFailedAt, isClaudeAuthFailure, noteClaudeAuth } from "@/platform/claudeLogin";

describe("isClaudeAuthFailure", () => {
  it("recognizes an expired or missing login, and nothing else", () => {
    expect(isClaudeAuthFailure("Claude's PR summary failed: Failed to authenticate: OAuth session expired and could not be refreshed")).toBe(true);
    expect(isClaudeAuthFailure("Invalid API key · Please run /login")).toBe(true);
    expect(isClaudeAuthFailure("Claude's PR summary took too long and was stopped")).toBe(false);
  });
});

describe("noteClaudeAuth", () => {
  it("remembers a refusal until a call gets through", () => {
    noteClaudeAuth(true);
    expect(claudeAuthFailedAt()).toBeTypeOf("number");
    noteClaudeAuth(false);
    expect(claudeAuthFailedAt()).toBeUndefined();
  });
});
