import { mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { folderSchema, optionalFolderSchema } from "@/app/api/_lib/folderSchema";

const dir = mkdtempSync(path.join(tmpdir(), "folder-schema-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const codeOf = async (input: string) => {
  const parsed = await folderSchema.safeParseAsync(input);
  const issue = parsed.error?.issues[0];
  return issue?.code === "custom" ? issue.params?.code : undefined;
};

describe("folderSchema", () => {
  it("expands ~ to your home folder", async () => {
    expect(await folderSchema.parseAsync("~")).toBe(homedir());
    expect(await folderSchema.parseAsync(" ~/ ")).toBe(homedir());
  });

  it("leaves a ~ inside a name alone, so it is refused as relative", async () => {
    expect(await codeOf("~other/code")).toBe("folder-not-absolute");
  });

  it("refuses a relative path", async () => {
    expect(await codeOf("code/app")).toBe("folder-not-absolute");
  });

  it("refuses an absolute path with no folder there", async () => {
    expect(await codeOf(path.join(dir, "missing"))).toBe("folder-missing");
  });

  it("accepts an existing folder, normalized", async () => {
    expect(await folderSchema.parseAsync(`${dir}/./`)).toBe(dir);
  });

  it("keeps empty as empty; the optional form reads it as the default", async () => {
    expect(await folderSchema.parseAsync("  ")).toBe("");
    expect(await optionalFolderSchema.parseAsync("")).toBeUndefined();
    expect(await optionalFolderSchema.parseAsync(undefined)).toBeUndefined();
  });
});
