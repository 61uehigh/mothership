import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { listMeetingNotes, listNuclinoCollections, noteListedItems, readMeetingNote, restoreNuclinoItems, saveNuclinoItems } from "@/features/tools/nuclino/server/nuclinoMeetings";
import { RateLimitGate, ToolRateLimitError } from "@/platform/mcp/RateLimitGate";
import type { ToolCaller } from "@/platform/mcp/ToolCaller";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const WORKSPACE = id(900);

// Shaped like real `get_item` / `list_workspaces` answers: a "Weekly" collection holding one collection per year.
const items: Record<string, Record<string, unknown>> = {
  [id(1)]: { type: "collection", id: id(1), workspaceId: WORKSPACE, title: "Weekly", childIds: [id(2), id(3)] },
  [id(2)]: { type: "collection", id: id(2), workspaceId: WORKSPACE, title: "2026", childIds: [id(10), id(11)] },
  [id(3)]: { type: "collection", id: id(3), workspaceId: WORKSPACE, title: "2025", childIds: [id(12)] },
  [id(10)]: { type: "item", id: id(10), title: "2026-01-05", createdAt: "2026-01-05T01:00:00Z", lastUpdatedAt: "2026-01-05T02:00:00Z", content: "+---+---+\n| a | b |\n+---+---+" },
  [id(11)]: { type: "item", id: id(11), title: "2026-01-12", createdAt: "2026-01-12T01:00:00Z", lastUpdatedAt: "2026-01-12T02:00:00Z", content: "notes" },
  [id(12)]: { type: "item", id: id(12), title: "2025-12-29", createdAt: "2025-12-29T01:00:00Z", lastUpdatedAt: "2025-12-29T02:00:00Z", content: "" },
  [id(20)]: { type: "item", id: id(20), title: "Readme", createdAt: "2020-01-01T00:00:00Z" },
};

function fakeNuclino(): ToolCaller & { calls: Array<string> } {
  const calls: Array<string> = [];
  return {
    label: `fake-${Math.random()}`,
    calls,
    async callText(tool: string, args: Record<string, unknown>) {
      calls.push(`${tool}:${String(args.itemId ?? "")}`);
      if (tool === "list_workspaces") return JSON.stringify([{ id: WORKSPACE, name: "Operation", childIds: [id(1), id(20)] }]);
      const item = items[String(args.itemId)];
      if (item === undefined) throw new Error("Item not found");
      return JSON.stringify(item);
    },
  } as unknown as ToolCaller & { calls: Array<string> };
}

describe("listNuclinoCollections", () => {
  it("lists workspaces, then only the collections inside one", async () => {
    const caller = fakeNuclino();
    expect(await listNuclinoCollections(caller, undefined, [])).toEqual([{ kind: "workspace", id: WORKSPACE, title: "Operation", workspace: "Operation", path: [] }]);
    expect(await listNuclinoCollections(caller, WORKSPACE, ["Operation"])).toEqual([
      { kind: "collection", id: id(1), title: "Weekly", workspace: "Operation", path: ["Operation"] },
    ]);
  });
});

describe("listMeetingNotes", () => {
  it("includes notes in nested collections, newest first", async () => {
    const { notes, limitedUntil } = await listMeetingNotes(fakeNuclino(), { id: id(1), title: "Weekly", workspace: "Operation" }, true);
    expect(limitedUntil).toBeUndefined();
    expect(notes.map((n) => n.title)).toEqual(["2026-01-12", "2026-01-05", "2025-12-29"]);
    expect(notes[0].collectionId).toBe(id(1));
  });

  it("reads the collections again on refresh but reuses the notes it already read", async () => {
    const first = fakeNuclino();
    await listMeetingNotes(first, { id: id(1), title: "Weekly", workspace: "Operation" }, true);
    const again = fakeNuclino();
    await listMeetingNotes(again, { id: id(1), title: "Weekly", workspace: "Operation" }, true);
    expect(again.calls).toEqual([`get_item:${id(1)}`, `get_item:${id(2)}`, `get_item:${id(3)}`]);
  });
});

describe("readMeetingNote", () => {
  it("returns the body with grid tables converted", async () => {
    const note = await readMeetingNote(fakeNuclino(), id(10));
    expect(note.markdown).toContain("| a | b |");
    expect(note.updatedAt).toBe(Date.parse("2026-01-05T02:00:00Z"));
  });
});

describe("rate limits", () => {
  it("answers from the cache while Nuclino is rate limiting, and stops calling it", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    await readMeetingNote(fakeNuclino(), id(11));
    // Past the half minute an opened note is reused for, so the next open reads it again.
    vi.setSystemTime(Date.now() + 60_000);
    const limited = fakeNuclino();
    limited.callText = async (tool, args) => {
      limited.calls.push(`${tool}:${String(args.itemId ?? "")}`);
      throw new Error('Could not connect to nuclino: Streamable HTTP error: Error POSTing to endpoint: {"status":"fail","message":"You\'ve made too many requests and hit a rate limit"}');
    };
    const gated = new RateLimitGate().wrap(limited);
    expect((await readMeetingNote(gated, id(11))).title).toBe("2026-01-12");
    await expect(readMeetingNote(gated, id(30))).rejects.toBeInstanceOf(ToolRateLimitError);
    expect(limited.calls).toEqual([`get_item:${id(11)}`]);
    vi.useRealTimers();
  });

  it("lists the notes it read before while rate limited, and says until when", async () => {
    // The tests above read collection 1 and its notes; then the limit hits.
    const until = Date.now() + 30_000;
    const limited = fakeNuclino();
    limited.callText = async () => {
      throw new ToolRateLimitError("Nuclino", until);
    };
    const listing = await listMeetingNotes(limited, { id: id(1), title: "Weekly", workspace: "Operation" }, true);
    expect(listing.notes.map((n) => n.title)).toEqual(["2026-01-12", "2026-01-05", "2025-12-29"]);
    expect(listing.limitedUntil).toBe(until);
  });

  it("leaves out notes it never read, rather than fail the whole list", async () => {
    const limited = fakeNuclino();
    limited.callText = async (tool, args) => {
      if (args.itemId === id(40)) return JSON.stringify({ type: "collection", id: id(40), title: "New", childIds: [id(41), id(42)] });
      throw new ToolRateLimitError("Nuclino", Date.now() + 30_000);
    };
    const listing = await listMeetingNotes(limited, { id: id(40), title: "New", workspace: "Operation" }, true);
    expect(listing.notes).toEqual([]);
    expect(listing.limitedUntil).toBeGreaterThan(Date.now());
  });
});

describe("saved items", () => {
  it("keeps titles and dates across a restart, but not note bodies", async () => {
    const file = path.join(await mkdtemp(path.join(tmpdir(), "nuclino-items-")), "nuclino-items.json");
    // A run before this one read collection 60 and its two notes an hour ago.
    const hourAgo = Date.now() - 60 * 60_000;
    const saved = {
      [id(60)]: { at: Date.now(), item: { type: "collection", id: id(60), title: "Saved", childIds: [id(61), id(62)] } },
      [id(61)]: { at: hourAgo, item: { type: "item", id: id(61), title: "Kept 1", createdAt: "2026-02-01T00:00:00Z" } },
      [id(62)]: { at: hourAgo, item: { type: "item", id: id(62), title: "Kept 2", createdAt: "2026-02-02T00:00:00Z" } },
    };
    await writeFile(file, JSON.stringify(saved));
    await restoreNuclinoItems(file);

    // Listing them again within a day reads nothing.
    const caller = fakeNuclino();
    const listing = await listMeetingNotes(caller, { id: id(60), title: "Saved", workspace: "Operation" }, false);
    expect(listing.notes.map((n) => n.title)).toEqual(["Kept 2", "Kept 1"]);
    expect(caller.calls).toEqual([]);

    // A note body is never taken from the saved copy.
    await expect(readMeetingNote(caller, id(61))).rejects.toThrow(/not found/);

    await readMeetingNote(fakeNuclino(), id(11));
    await saveNuclinoItems(file);
    const written = JSON.parse(await readFile(file, "utf8")) as Record<string, { item: { title: string; content?: string } }>;
    expect(written[id(11)].item.title).toBe("2026-01-12");
    expect(written[id(11)].item.content).toBeUndefined();
  });

  it("drops items not read for over eight days when saving", async () => {
    const file = path.join(await mkdtemp(path.join(tmpdir(), "nuclino-items-")), "nuclino-items.json");
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      await readMeetingNote(fakeNuclino(), id(11));
      vi.setSystemTime(Date.now() + 9 * 24 * 60 * 60_000);
      await readMeetingNote(fakeNuclino(), id(10));
      await saveNuclinoItems(file);
      const written = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
      expect(Object.keys(written)).toEqual([id(10)]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("change detection", () => {
  it("takes a changed title and date from another listing without reading the note", async () => {
    await listMeetingNotes(fakeNuclino(), { id: id(1), title: "Weekly", workspace: "Operation" }, false);
    // Recent docs says note 11 was edited.
    noteListedItems([{ id: id(11), title: "2026-01-12 (moved)", lastUpdatedAt: "2026-01-20T00:00:00Z" }]);
    const caller = fakeNuclino();
    const { notes } = await listMeetingNotes(caller, { id: id(1), title: "Weekly", workspace: "Operation" }, false);
    expect(notes.find((n) => n.id === id(11))).toMatchObject({ title: "2026-01-12 (moved)", updatedAt: Date.parse("2026-01-20T00:00:00Z") });
    expect(caller.calls).toEqual([]);

    // Its body is read again when it is opened, since the cached one is older than the edit.
    await readMeetingNote(caller, id(11));
    expect(caller.calls).toEqual([`get_item:${id(11)}`]);
  });

  it("leaves notes whose date did not change alone", async () => {
    await readMeetingNote(fakeNuclino(), id(10));
    noteListedItems([{ id: id(10), title: "2026-01-05", lastUpdatedAt: "2026-01-05T02:00:00Z" }]);
    const caller = fakeNuclino();
    await readMeetingNote(caller, id(10));
    expect(caller.calls).toEqual([]);
  });
});
