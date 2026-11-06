import { describe, expect, it } from "vitest";
import { kindsWith, namesOf } from "@/features/sessions/model/AgentEvents";

describe("kindsWith and namesOf", () => {
  it("name the backends that have a capability for a sentence", () => {
    expect(namesOf(kindsWith("gitAccess"))).toBe("Claude");
    expect(namesOf(kindsWith("forksImports"))).toBe("Claude");
    expect(namesOf(["claude", "codex"])).toBe("Claude and Codex");
  });
});
