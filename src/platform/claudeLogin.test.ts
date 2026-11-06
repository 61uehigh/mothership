import { describe, expect, it } from "vitest";
import { isClaudeAuthFailure, isClaudeLimitFailure } from "@/platform/claudeLogin";

describe("isClaudeAuthFailure", () => {
  it("recognizes an expired or missing login, and nothing else", () => {
    expect(isClaudeAuthFailure("Claude's PR summary failed: Failed to authenticate: OAuth session expired and could not be refreshed")).toBe(true);
    expect(isClaudeAuthFailure("Invalid API key · Please run /login")).toBe(true);
    expect(isClaudeAuthFailure("Claude's PR summary took too long and was stopped")).toBe(false);
  });
});

describe("isClaudeLimitFailure", () => {
  it("recognizes a used-up usage, spend, or rate limit", () => {
    expect(isClaudeLimitFailure("You've hit your org's monthly spend limit · resets 7am")).toBe(true);
    expect(isClaudeLimitFailure('API Error: 429 {"type":"error","error":{"type":"rate_limit_error"}}')).toBe(true);
  });

  it("does not report an overloaded API as a used-up limit, since nothing is used up and nothing resets", () => {
    expect(isClaudeLimitFailure('API Error: 529 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}')).toBe(false);
  });
});
