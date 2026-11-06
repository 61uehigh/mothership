import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InboxReadStore, pruneMarks } from "@/features/inbox/server/InboxReadStore";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-11-23T00:00:00Z");

describe("InboxReadStore", () => {
  let dir: string;
  let file: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "inbox-read-"));
    file = path.join(dir, "inbox-read.json");
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("starts with what is in the Inbox now marked read, once", async () => {
    const store = new InboxReadStore(file);
    const first = await store.state(["a", "b"], NOW);
    expect(first).toEqual({ since: NOW, marks: { a: { read: true, at: NOW }, b: { read: true, at: NOW } } });
    // Later loads keep the first start, even with other items.
    expect(await store.state(["c"], NOW + DAY)).toEqual(first);
  });

  it("starts only once when two loads race", async () => {
    const store = new InboxReadStore(file);
    const [one, two] = await Promise.all([store.state(["a"], NOW), store.state(["b"], NOW + 1)]);
    expect(two).toEqual(one);
  });

  it("sets a damaged file aside as .bak before starting over", async () => {
    await writeFile(file, "{ not json");
    const store = new InboxReadStore(file);
    expect(await store.state(["a"], NOW)).toEqual({ since: NOW, marks: { a: { read: true, at: NOW } } });
    expect(await readFile(`${file}.bak`, "utf8")).toBe("{ not json");
  });

  it("fails rather than wiping the marks when the file cannot be read", async () => {
    await mkdir(file);
    const store = new InboxReadStore(file);
    await expect(store.state(["a"], NOW)).rejects.toThrow();
    await expect(store.mark(["a"], true, NOW)).rejects.toThrow();
  });
});

describe("pruneMarks", () => {
  it("drops marks older than 90 days", () => {
    expect(pruneMarks({ old: { read: true, at: NOW - 91 * DAY }, recent: { read: true, at: NOW - 89 * DAY } }, NOW)).toEqual({ recent: { read: true, at: NOW - 89 * DAY } });
  });
});
