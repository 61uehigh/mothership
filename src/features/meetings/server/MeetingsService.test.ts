import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MeetingsService, type MeetingNotesSource } from "@/features/meetings/server/MeetingsService";

vi.mock("@/platform/SummaryStore", () => ({
  SummaryStore: class {
    async has() {
      return false;
    }
  },
}));

function fakeSource(limitedUntil?: () => number | undefined): MeetingNotesSource & { reads: number } {
  const source = {
    reads: 0,
    async listNotes() {
      source.reads++;
      const until = limitedUntil?.();
      return { notes: [{ id: "n1", title: "Weekly", collectionId: "c1", createdAt: 1, updatedAt: 1 }], ...(until === undefined ? {} : { limitedUntil: until }) };
    },
    readNote: async () => ({ title: "", markdown: "", updatedAt: undefined }),
    listCollections: async () => [],
    noteUrl: (id: string) => id,
    restoreCache: async () => undefined,
    saveCache: async () => undefined,
  };
  return source;
}

const deps = (source: MeetingNotesSource) => ({
  source,
  collections: async () => [{ id: "c1", title: "Weekly", workspace: "Operation" }],
  today: async () => "2026-11-18",
});

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("MeetingsService.list", () => {
  it("answers the last list without reading, and rereads it in the background once it is old", async () => {
    const source = fakeSource();
    const meetings = new MeetingsService(deps(source));
    await meetings.list(false);
    await meetings.list(false);
    expect(source.reads).toBe(1);

    vi.advanceTimersByTime(11 * 60_000);
    const answer = await meetings.list(false);
    expect(answer.collections[0].notes).toHaveLength(1);
    await vi.waitFor(() => expect(source.reads).toBe(2));
  });

  it("reads again when asked to refresh, or when the last list was cut short by a rate limit", async () => {
    let until: number | undefined = Date.now() + 30_000;
    const source = fakeSource(() => until);
    const meetings = new MeetingsService(deps(source));
    expect((await meetings.list(false)).rateLimitedUntil).toBeDefined();
    until = undefined;
    expect((await meetings.list(false)).rateLimitedUntil).toBeUndefined();
    await meetings.list(true);
    expect(source.reads).toBe(3);
  });
});
