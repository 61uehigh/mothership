import { describe, expect, it } from "vitest";
import { ToolCallLedger } from "@/platform/mcp/ToolCallLedger";

describe("ToolCallLedger", () => {
  it("counts calls by source and tool name, and keeps held-back calls apart", () => {
    let now = Date.UTC(2026, 10, 18, 3, 0, 10);
    const ledger = new ToolCallLedger(() => now);
    for (let i = 0; i < 5; i++) ledger.record("Nuclino", "get_item", "meetings list", "ok");
    ledger.record("Nuclino", "list_items", "sidebar", "ok");
    ledger.record("Nuclino", "get_item", "meeting note", "rate-limited");
    ledger.record("Nuclino", "get_item", "meeting note", "held");
    ledger.record("Linear", "list_issues", "sidebar", "error");

    const [nuclino, linear] = ledger.counts(now - 60_000);
    expect(nuclino).toEqual({
      tool: "Nuclino",
      calls: 7,
      rateLimited: 1,
      held: 1,
      bySource: [
        { source: "meetings list", calls: 5 },
        { source: "meeting note", calls: 1 },
        { source: "sidebar", calls: 1 },
      ],
      byName: [
        { name: "get_item", calls: 6 },
        { name: "list_items", calls: 1 },
      ],
    });
    expect(linear.calls).toBe(1);

    now += 60_000;
    expect(ledger.minuteLines()[0]).toMatch(/^\[tool calls\] Nuclino \d\d:\d\d: 7 calls \(meetings list 5, meeting note 1, sidebar 1\) · 1 rate limited · 1 held back$/);
  });

  it("forgets calls older than an hour", () => {
    let now = 0;
    const ledger = new ToolCallLedger(() => now);
    ledger.record("Nuclino", "get_item", "sidebar", "ok");
    now = 61 * 60_000;
    ledger.record("Nuclino", "get_item", "sidebar", "ok");
    expect(ledger.counts(0)[0].calls).toBe(1);
  });
});
