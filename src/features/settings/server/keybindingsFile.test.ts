import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseKeyOverrides, setKeyOverride } from "@/features/settings/server/keybindingsFile";

describe("parseKeyOverrides", () => {
  it("drops only the invalid entries", () => {
    expect(parseKeyOverrides("overrides:\n  palette: [mod+k]\n  broken: [mod+nope]\n  off: []\n")).toEqual({ overrides: { palette: ["mod+k"], off: [] }, dropped: true });
  });

  it("reads an empty or comment-only file as no overrides", () => {
    expect(parseKeyOverrides("")).toEqual({ overrides: {}, dropped: false });
    expect(parseKeyOverrides("# your shortcuts\n")).toEqual({ overrides: {}, dropped: false });
  });

  it("marks text that is not YAML as dropped", () => {
    expect(parseKeyOverrides("overrides: [unclosed")).toEqual({ overrides: {}, dropped: true });
  });
});

describe("setKeyOverride", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("keeps the other valid overrides and a copy of the file when one entry is invalid", async () => {
    const folder = await mkdtemp(path.join(tmpdir(), "keys-"));
    vi.stubEnv("MOTHERSHIP_DATA_DIR", folder);
    await mkdir(path.join(folder, "config"));
    const original = "# mine\noverrides:\n  palette: [mod+k]\n  broken: [mod+nope]\n";
    await writeFile(path.join(folder, "config", "keybindings.yaml"), original);
    expect(await setKeyOverride("search", ["mod+p"])).toEqual({ palette: ["mod+k"], search: ["mod+p"] });
    const backup = (await readdir(path.join(folder, "config"))).find((name) => name.startsWith("keybindings.yaml.bad-"));
    expect(backup).toBeDefined();
    expect(await readFile(path.join(folder, "config", backup ?? ""), "utf8")).toBe(original);
  });
});
