import { mkdtemp, readFile, readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { toJsonFile, writeFileAtomic, writeQueueFor } from "@/platform/files";

describe("writeFileAtomic", () => {
  it("creates the folder, writes the file with its mode, and leaves no temporary file", async () => {
    const folder = await mkdtemp(path.join(tmpdir(), "files-"));
    const file = path.join(folder, "nested", "data.json");
    await writeFileAtomic(file, toJsonFile({ a: 1 }), { mode: 0o600 });
    expect(await readFile(file, "utf8")).toBe('{\n  "a": 1\n}\n');
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect(await readdir(path.dirname(file))).toEqual(["data.json"]);
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
