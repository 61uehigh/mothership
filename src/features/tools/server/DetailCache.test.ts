import { describe, expect, it } from "vitest";
import { DETAIL_PREFIXES, DetailCache, LINEAR_NOTIFICATIONS_KEY } from "@/features/tools/server/DetailCache";

describe("DetailCache", () => {
  it("loads the Inbox's Linear notifications again after a Linear write forgets the tool's details", async () => {
    const cache = new DetailCache();
    let loads = 0;
    const load = async () => ({ status: "ok" as const, value: ++loads });
    await cache.cached(LINEAR_NOTIFICATIONS_KEY, false, load);
    await cache.cached(LINEAR_NOTIFICATIONS_KEY, false, load);
    expect(loads).toBe(1);
    cache.forget(DETAIL_PREFIXES.linear);
    await cache.cached(LINEAR_NOTIFICATIONS_KEY, false, load);
    expect(loads).toBe(2);
  });
});
