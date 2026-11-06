import { describe, expect, it, vi } from "vitest";
import { StreamableHTTPError } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { McpCallError } from "@/platform/mcp/McpClientPool";
import { ConnectorClaudeError, ConnectorToolError } from "@/platform/mcp/relayErrors";
import { isRateLimited, RateLimitGate, ToolRateLimitError } from "@/platform/mcp/RateLimitGate";
import { withCallPurpose } from "@/platform/mcp/callPurpose";
import { ToolCallLedger } from "@/platform/mcp/ToolCallLedger";
import type { ToolCaller } from "@/platform/mcp/ToolCaller";

const NUCLINO_429 = 'Error POSTing to endpoint: {"status":"fail","message":"You\'ve made too many requests and hit a rate limit"}';

describe("isRateLimited", () => {
  it("sees a 429 during connect, wrapped as a connection failure", () => {
    const http = new StreamableHTTPError(429, NUCLINO_429);
    expect(isRateLimited(new McpCallError(`Could not connect to nuclino: ${http.message}`, { cause: http }))).toBe(true);
  });

  it("sees a 429 by its status even when the message does not say so", () => {
    expect(isRateLimited(new McpCallError("nuclino failed", { cause: new StreamableHTTPError(429, "") }))).toBe(true);
  });

  it("sees a relay's plain-text answer", () => {
    expect(isRateLimited(new Error("Too Many Requests"))).toBe(true);
  });

  it("leaves other failures alone", () => {
    expect(isRateLimited(new McpCallError("nuclino did not answer in time", { cause: new StreamableHTTPError(503, "Service Unavailable") }))).toBe(false);
    expect(isRateLimited(new Error("Item not found"))).toBe(false);
  });
});

function fakeCaller(fail: () => boolean): ToolCaller & { calls: number } {
  const caller = {
    label: "mcp:nuclino",
    calls: 0,
    async callText() {
      caller.calls++;
      if (fail()) throw new McpCallError(`Could not connect to nuclino: ${NUCLINO_429}`);
      return "ok";
    },
    async describe() {
      return undefined;
    },
  };
  return caller;
}

describe("RateLimitGate", () => {
  it("holds back every call during the pause, then lets them through", async () => {
    let now = 1_000_000;
    let failing = true;
    const gate = new RateLimitGate({ now: () => now });
    const tool = fakeCaller(() => failing);
    const sidebar = gate.wrap(tool);
    const meeting = gate.wrap(tool);

    const error = await sidebar.callText("get_item", {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ToolRateLimitError);
    expect((error as ToolRateLimitError).message).toMatch(/^Nuclino is rate limiting requests; retrying in \d+s\.$/);
    expect(gate.retryAt("mcp:nuclino")).toBe(now + 30_000);

    // Another caller of the same tool waits too, without a request.
    await expect(meeting.callText("get_item", {})).rejects.toBeInstanceOf(ToolRateLimitError);
    expect(tool.calls).toBe(1);

    now += 30_000;
    failing = false;
    expect(await meeting.callText("get_item", {})).toBe("ok");
    expect(gate.retryAt("mcp:nuclino")).toBeUndefined();
  });

  it("doubles the pause while the limit keeps coming back, up to five minutes", async () => {
    let now = 0;
    const gate = new RateLimitGate({ now: () => now });
    const caller = gate.wrap(fakeCaller(() => true));
    const pauses: Array<number> = [];
    for (let i = 0; i < 6; i++) {
      await caller.callText("get_item", {}).catch(() => undefined);
      const until = gate.retryAt("mcp:nuclino") ?? now;
      pauses.push(until - now);
      now = until;
    }
    expect(pauses).toEqual([30_000, 60_000, 120_000, 240_000, 300_000, 300_000]);
  });

  it("counts calls that were already in flight as one limit", async () => {
    const now = 0;
    const gate = new RateLimitGate({ now: () => now });
    const caller = gate.wrap(fakeCaller(() => true));
    await Promise.all([1, 2, 3, 4].map(() => caller.callText("get_item", {}).catch(() => undefined)));
    expect(gate.retryAt("mcp:nuclino")).toBe(30_000);
  });

  it("passes other failures through untouched", async () => {
    const gate = new RateLimitGate();
    const caller = gate.wrap({ label: "mcp:nuclino", callText: async () => Promise.reject(new Error("Item not found")), describe: async () => undefined });
    await expect(caller.callText("get_item", {})).rejects.toThrow("Item not found");
    expect(gate.retryAt("mcp:nuclino")).toBeUndefined();
  });
});

describe("RateLimitGate on a connector relay", () => {
  const relayed = (error: Error): ToolCaller => ({ label: "connector:Google Calendar", callText: async () => Promise.reject(error), describe: async () => undefined });

  it("does not pause a tool for Claude's own rate limit on a relay", async () => {
    const gate = new RateLimitGate();
    const claudeLimit = new ConnectorClaudeError("claude-limit", 'API Error: 429 {"type":"error","error":{"type":"rate_limit_error"}}');
    await expect(gate.wrap(relayed(claudeLimit)).callText("list_events", {})).rejects.toBe(claudeLimit);
    expect(gate.retryAt("connector:Google Calendar")).toBeUndefined();
  });

  it("pauses a tool whose own answer through the relay is a rate limit", async () => {
    const gate = new RateLimitGate();
    const toolLimit = new ConnectorToolError("claude.ai Google Calendar list_events failed: 429 Too Many Requests");
    await expect(gate.wrap(relayed(toolLimit)).callText("list_events", {})).rejects.toBeInstanceOf(ToolRateLimitError);
    expect(gate.retryAt("connector:Google Calendar")).toBeDefined();
  });
});

describe("RateLimitGate after a pause", () => {
  it("sends one call first and holds the rest until it answers", async () => {
    let now = 0;
    let failing = true;
    const gate = new RateLimitGate({ now: () => now });
    const tool = fakeCaller(() => failing);
    const caller = gate.wrap(tool);
    await caller.callText("get_item", {}).catch(() => undefined);
    expect(tool.calls).toBe(1);

    // The limit is back when the pause ends: one call finds out, the other three never go out.
    now = 30_000;
    const results = await Promise.allSettled([1, 2, 3, 4].map(() => caller.callText("get_item", {})));
    expect(results.every((r) => r.status === "rejected" && r.reason instanceof ToolRateLimitError)).toBe(true);
    expect(tool.calls).toBe(2);
    expect(gate.retryAt("mcp:nuclino")).toBe(30_000 + 60_000);

    // Over this time: the first call goes through, then the rest follow.
    now = 90_000;
    failing = false;
    expect(await Promise.all([1, 2, 3].map(() => caller.callText("get_item", {})))).toEqual(["ok", "ok", "ok"]);
    expect(tool.calls).toBe(5);
    expect(gate.retryAt("mcp:nuclino")).toBeUndefined();
  });
});

describe("RateLimitGate with a budget", () => {
  it("spaces calls out, counts them by purpose, and counts held-back calls", async () => {
    vi.useFakeTimers();
    try {
      const ledger = new ToolCallLedger();
      const gate = new RateLimitGate({ budgets: { nuclino: { perMinute: 60, burst: 2 } }, ledger });
      let failing = false;
      const tool = fakeCaller(() => failing);
      const caller = gate.wrap(tool);
      const calls = withCallPurpose({ source: "meetings list", background: true }, () => [1, 2, 3, 4].map(() => caller.callText("get_item", {})));
      await vi.advanceTimersByTimeAsync(1500);
      expect(tool.calls).toBe(3);
      await vi.advanceTimersByTimeAsync(1000);
      await Promise.all(calls);

      failing = true;
      await vi.advanceTimersByTimeAsync(5000);
      await withCallPurpose({ source: "meeting note", background: false }, () => caller.callText("get_item", {}).catch(() => undefined));
      await caller.callText("get_item", {}).catch(() => undefined);

      const [nuclino] = ledger.counts(0);
      expect(nuclino).toMatchObject({ tool: "Nuclino", calls: 5, rateLimited: 1, held: 1 });
      expect(nuclino.bySource).toEqual([
        { source: "meetings list", calls: 4 },
        { source: "meeting note", calls: 1 },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });
});
