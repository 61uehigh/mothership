import { describe, expect, it } from "vitest";
import { StreamableHTTPError } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { McpCallError } from "@/platform/mcp/McpClientPool";
import { isRateLimited, RateLimitGate, ToolRateLimitError } from "@/platform/mcp/RateLimitGate";
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
    const gate = new RateLimitGate(() => now);
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
    const gate = new RateLimitGate(() => now);
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
    const gate = new RateLimitGate(() => now);
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
