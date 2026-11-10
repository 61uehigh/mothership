import { describe, expect, it } from "vitest";
import { listMeetingNotes, listNuclinoCollections, readMeetingNote } from "@/features/tools/nuclino/server/nuclinoMeetings";
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
    const notes = await listMeetingNotes(fakeNuclino(), { id: id(1), title: "Weekly", workspace: "Operation" }, (noteId) => noteId === id(11), true);
    expect(notes.map((n) => [n.title, n.summarized])).toEqual([
      ["2026-01-12", true],
      ["2026-01-05", false],
      ["2025-12-29", false],
    ]);
    expect(notes[0].collectionId).toBe(id(1));
  });

  it("reads the collections again on refresh but reuses the notes it already read", async () => {
    const first = fakeNuclino();
    await listMeetingNotes(first, { id: id(1), title: "Weekly", workspace: "Operation" }, () => false, true);
    const again = fakeNuclino();
    await listMeetingNotes(again, { id: id(1), title: "Weekly", workspace: "Operation" }, () => false, true);
    expect(again.calls).toEqual([`get_item:${id(1)}`, `get_item:${id(2)}`, `get_item:${id(3)}`]);
  });
});

describe("readMeetingNote", () => {
  it("returns the body with grid tables converted", async () => {
    const note = await readMeetingNote(fakeNuclino(), id(10));
    expect(note.markdown).toContain("| a | b |");
    expect(note.updatedAt).toBe(Date.parse("2026-01-05T02:00:00Z"));
  });

  it("refuses a collection", async () => {
    await expect(readMeetingNote(fakeNuclino(), id(1))).rejects.toThrow(/collection/);
  });
});

describe("rate limits", () => {
  it("answers from the cache while Nuclino is rate limiting, and stops calling it", async () => {
    await readMeetingNote(fakeNuclino(), id(11));
    const limited = fakeNuclino();
    limited.callText = async (tool, args) => {
      limited.calls.push(`${tool}:${String(args.itemId ?? "")}`);
      throw new Error('Could not connect to nuclino: Streamable HTTP error: Error POSTing to endpoint: {"status":"fail","message":"You\'ve made too many requests and hit a rate limit"}');
    };
    const gated = new RateLimitGate().wrap(limited);
    expect((await readMeetingNote(gated, id(11))).title).toBe("2026-01-12");
    await expect(readMeetingNote(gated, id(30))).rejects.toBeInstanceOf(ToolRateLimitError);
    expect(limited.calls).toEqual([`get_item:${id(11)}`]);
  });

  it("fails a listing rather than leave out notes it could not read", async () => {
    const limited = fakeNuclino();
    // The collection is read; the limit hits on its notes.
    limited.callText = async (tool, args) => {
      if (args.itemId === id(40)) return JSON.stringify({ type: "collection", id: id(40), title: "New", childIds: [id(41), id(42)] });
      throw new ToolRateLimitError("Nuclino", Date.now() + 30_000);
    };
    await expect(listMeetingNotes(limited, { id: id(40), title: "New", workspace: "Operation" }, () => false, true)).rejects.toThrow(/rate limiting/);
  });
});
