import { mkdir, mkdtemp, readFile, rm, rmdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SummaryStore } from "@/platform/SummaryStore";

describe("SummaryStore", () => {
  let dir: string;
  let file: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "summaries-"));
    file = path.join(dir, "summaries.json");
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(dir, { recursive: true, force: true });
  });

  it("starts empty when there is no file yet", async () => {
    const store = new SummaryStore<string>("summaries", file);
    expect(await store.has("a", "v1")).toBe(false);
    await store.set("a", "v1", "summary");
    expect(await new SummaryStore<string>("summaries", file).get("a", "v1")).toMatchObject({ value: "summary" });
  });

  it("a read error never wipes saved summaries", async () => {
    await mkdir(file);
    const store = new SummaryStore<string>("summaries", file);
    await expect(store.has("a", "v1")).rejects.toThrow();
    await expect(store.set("b", "v1", "new")).rejects.toThrow();
    // Once the file can be read, it is read again rather than taken as empty.
    await rmdir(file);
    await writeFile(file, JSON.stringify({ a: { version: "v1", at: 1, value: "kept" } }));
    await store.set("b", "v1", "new");
    expect(Object.keys(JSON.parse(await readFile(file, "utf8")))).toEqual(["a", "b"]);
  });

  it("sets a damaged or invalid file aside as .bak before starting over", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const invalid = JSON.stringify({ a: { version: 1, value: "no at" } });
    await writeFile(file, invalid);
    const store = new SummaryStore<string>("summaries", file);
    expect(await store.has("a", "1")).toBe(false);
    expect(await readFile(`${file}.bak`, "utf8")).toBe(invalid);
  });
});
