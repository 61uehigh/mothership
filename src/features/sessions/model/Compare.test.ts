import { describe, expect, it } from "vitest";
import { compareAttemptNames } from "@/features/sessions/model/Compare";

describe("compareAttemptNames", () => {
  it("names each attempt after its backend when every backend appears once", () => {
    expect(compareAttemptNames("fix-login", [{ provider: "claude" }, { provider: "codex" }])).toEqual(["fix-login-claude", "fix-login-codex"]);
  });

  it("adds the 1-based position only to backends that repeat, so no two attempts share a name", () => {
    expect(compareAttemptNames("fix", [{ provider: "claude" }, { provider: "codex" }, { provider: "claude" }])).toEqual([
      "fix-claude-1",
      "fix-codex",
      "fix-claude-3",
    ]);
  });
});
