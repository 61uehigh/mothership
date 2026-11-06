import { mkdtemp, readFile, readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toJsonFile, writeFileAtomic, writeQueueFor } from "@/platform/files";

/** Errors the next renames fail with, one per call, before renames go through again. */
const renameFailures: Array<string> = [];

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    rename: async (from: string, to: string) => {
      const code = renameFailures.shift();
      if (code !== undefined) throw Object.assign(new Error(`${code}: rename`), { code });
      return actual.rename(from, to);
    },
  };
});

function onPlatform(platform: NodeJS.Platform): void {
  vi.spyOn(process, "platform", "get").mockReturnValue(platform);
}

afterEach(() => {
  renameFailures.length = 0;
  vi.restoreAllMocks();
});

describe("writeFileAtomic", () => {
  it("creates the folder, writes the file with its mode, and leaves no temporary file", async () => {
    const folder = await mkdtemp(path.join(tmpdir(), "files-"));
    const file = path.join(folder, "nested", "data.json");
    await writeFileAtomic(file, toJsonFile({ a: 1 }), { mode: 0o600 });
    expect(await readFile(file, "utf8")).toBe('{\n  "a": 1\n}\n');
    // Windows has no POSIX file modes.
    if (process.platform !== "win32") expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect(await readdir(path.dirname(file))).toEqual(["data.json"]);
  });
});

describe("writeFileAtomic when the rename fails", () => {
  it("tries again on Windows while another program has the file open", async () => {
    onPlatform("win32");
    const file = path.join(await mkdtemp(path.join(tmpdir(), "files-")), "data.json");
    renameFailures.push("EPERM", "EBUSY");
    await writeFileAtomic(file, "new");
    expect(await readFile(file, "utf8")).toBe("new");
    expect(await readdir(path.dirname(file))).toEqual(["data.json"]);
  });

  it("gives up after a few tries and removes its temporary file", async () => {
    onPlatform("win32");
    const folder = await mkdtemp(path.join(tmpdir(), "files-"));
    renameFailures.push("EBUSY", "EBUSY", "EBUSY", "EBUSY", "EBUSY");
    await expect(writeFileAtomic(path.join(folder, "data.json"), "new")).rejects.toMatchObject({ code: "EBUSY" });
    expect(await readdir(folder)).toEqual([]);
  });

  it("does not retry elsewhere, and still removes its temporary file", async () => {
    onPlatform("darwin");
    const folder = await mkdtemp(path.join(tmpdir(), "files-"));
    renameFailures.push("EPERM", "EPERM");
    await expect(writeFileAtomic(path.join(folder, "data.json"), "new")).rejects.toMatchObject({ code: "EPERM" });
    expect(renameFailures).toEqual(["EPERM"]);
    expect(await readdir(folder)).toEqual([]);
  });
});

describe("writeQueueFor", () => {
  it("runs one file's tasks one after another, however the path is spelled, and keeps going after a failure", async () => {
    const file = path.join(tmpdir(), `queue-${Date.now()}.json`);
    const queue = (task: () => Promise<unknown>) => writeQueueFor(file)(task);
    const sameFile = writeQueueFor(path.join(path.dirname(file), ".", path.basename(file)));
    const order: Array<string> = [];
    const slow = queue(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      order.push("first");
    });
    const failing = queue(async () => {
      order.push("second");
      throw new Error("boom");
    });
    const third = sameFile(async () => {
      order.push("third");
      return 3;
    });
    await slow;
    await expect(failing).rejects.toThrow("boom");
    expect(await third).toBe(3);
    expect(order).toEqual(["first", "second", "third"]);
  });
});
