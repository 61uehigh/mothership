import { describe, expect, it } from "vitest";
import { listMeetingNotes, listNuclinoCollections, readMeetingNote } from "@/features/tools/nuclino/server/nuclinoMeetings";
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
