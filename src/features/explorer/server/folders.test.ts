import { mkdir, mkdtemp, realpath, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { resolveInside, resolveInsideAny } from "@/features/explorer/server/folders";

// A home folder, a temp folder reached through a symlink (as macOS's /tmp → /private/tmp), and a folder outside both.
let home: string;
let realTemp: string;
let linkedTemp: string;
let outside: string;
// A file in a temp folder of its own, outside the sandbox: an outside path that exists on every OS.
let elsewhere: string;

beforeAll(async () => {
  const sandbox = await realpath(await mkdtemp(path.join(tmpdir(), "folders-")));
  [home, realTemp, outside] = [path.join(sandbox, "home"), path.join(sandbox, "private-tmp"), path.join(sandbox, "etc")];
  linkedTemp = path.join(sandbox, "tmp");
  await Promise.all([home, realTemp, outside].map((dir) => mkdir(dir)));
  await symlink(realTemp, linkedTemp);
  await writeFile(path.join(home, "notes.md"), "home");
  await writeFile(path.join(home, "..notes"), "a name that starts with two dots");
  await writeFile(path.join(realTemp, "comment.md"), "temp");
  await writeFile(path.join(outside, "hosts"), "outside");
  await symlink(path.join(outside, "hosts"), path.join(realTemp, "escape"));
  elsewhere = path.join(await realpath(await mkdtemp(path.join(tmpdir(), "folders-elsewhere-"))), "hosts");
  await writeFile(elsewhere, "elsewhere");
});

describe("resolveInsideAny", () => {
  it("opens files in home and in a temp folder, also through the temp folder's symlink", async () => {
    const dirs = [home, linkedTemp];
    expect(await resolveInsideAny(dirs, path.join(home, "notes.md"))).toBe(path.join(home, "notes.md"));
    expect(await resolveInsideAny(dirs, path.join(linkedTemp, "comment.md"))).toBe(path.join(realTemp, "comment.md"));
    expect(await resolveInsideAny(dirs, path.join(realTemp, "comment.md"))).toBe(path.join(realTemp, "comment.md"));
  });

  it("refuses files outside them, including through a symlink in the temp folder", async () => {
    const dirs = [home, linkedTemp];
    await expect(resolveInsideAny(dirs, path.join(outside, "hosts"))).rejects.toMatchObject({ status: 400 });
    await expect(resolveInsideAny(dirs, path.join(linkedTemp, "escape"))).rejects.toMatchObject({ status: 400 });
    await expect(resolveInsideAny(dirs, elsewhere)).rejects.toMatchObject({ status: 400 });
  });

  it("answers 404 for a missing file and skips folders that don't exist", async () => {
    await expect(resolveInsideAny([home], path.join(home, "gone.md"))).rejects.toMatchObject({ status: 404 });
    expect(await resolveInsideAny([path.join(home, "missing"), home], path.join(home, "notes.md"))).toBe(path.join(home, "notes.md"));
  });
});

describe("resolveInside", () => {
  it("resolves a path below the folder, including a name that starts with ..", async () => {
    expect(await resolveInside(home, "notes.md")).toBe(path.join(home, "notes.md"));
    expect(await resolveInside(home, "..notes")).toBe(path.join(home, "..notes"));
  });

  it("refuses .. and absolute paths that lead out of the folder", async () => {
    await expect(resolveInside(home, "..")).rejects.toMatchObject({ status: 400 });
    await expect(resolveInside(home, "../etc/hosts")).rejects.toMatchObject({ status: 400 });
    await expect(resolveInside(home, "sub/../../etc/hosts")).rejects.toMatchObject({ status: 400 });
    await expect(resolveInside(home, path.join(home, "notes.md"))).rejects.toMatchObject({ status: 400 });
  });

  it("refuses a symlink inside the folder that points out of it", async () => {
    await expect(resolveInside(realTemp, "escape")).rejects.toMatchObject({ status: 400 });
  });

  it("follows the folder's own symlink before comparing", async () => {
    expect(await resolveInside(linkedTemp, "comment.md")).toBe(path.join(realTemp, "comment.md"));
  });

  it("answers 404 for a missing file", async () => {
    await expect(resolveInside(home, "gone.md")).rejects.toMatchObject({ status: 404 });
  });
});
