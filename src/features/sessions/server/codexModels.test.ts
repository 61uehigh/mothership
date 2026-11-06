import { describe, expect, it } from "vitest";
import { parseCodexModels } from "@/features/sessions/server/codexModels";

describe("parseCodexModels", () => {
  it("lists the models Codex shows, best first, and leaves hidden ones out", () => {
    const cache = {
      fetched_at: "2026-11-18T00:00:00Z",
      models: [
        { slug: "gpt-b", display_name: "GPT B", visibility: "list", priority: 2 },
        { slug: "internal", display_name: "Internal", visibility: "hide", priority: 0 },
        { slug: "gpt-a", display_name: "GPT A", visibility: "list", priority: 1 },
        { slug: "gpt-c" },
      ],
    };
    expect(parseCodexModels(cache)).toEqual([
      { id: "gpt-a", label: "GPT A" },
      { id: "gpt-b", label: "GPT B" },
      { id: "gpt-c", label: "gpt-c" },
    ]);
  });

  it("gives nothing for a file in another shape", () => {
    expect(parseCodexModels({ models: "nope" })).toEqual([]);
    expect(parseCodexModels(null)).toEqual([]);
  });
});
