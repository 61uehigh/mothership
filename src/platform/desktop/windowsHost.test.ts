import { describe, expect, it } from "vitest";
import { cmdLine, urlProtocolKey, vscodeCandidates } from "@/platform/desktop/windowsHost";

describe("urlProtocolKey", () => {
  it("names the registry key of the link's scheme", () => {
    expect(urlProtocolKey("kakaotalk://")).toBe("HKCR\\kakaotalk");
    expect(urlProtocolKey("ms-settings:privacy")).toBe("HKCR\\ms-settings");
  });

  it("refuses text that is not a link", () => {
    expect(() => urlProtocolKey("C:\\Windows")).toThrow();
    expect(() => urlProtocolKey("& calc")).toThrow();
  });
});

describe("cmdLine", () => {
  it("quotes the whole line once more for cmd /k, and words with spaces", () => {
    expect(cmdLine(["C:\\Program Files\\Mothership\\resources\\bin\\claude.exe", "auth", "login"])).toBe(
      '""C:\\Program Files\\Mothership\\resources\\bin\\claude.exe" auth login"',
    );
    expect(cmdLine(["gh", "auth", "login"])).toBe('"gh auth login"');
  });

  it("quotes words cmd would read as operators", () => {
    expect(cmdLine(["C:\\a&b\\codex.exe", "login"])).toBe('""C:\\a&b\\codex.exe" login"');
  });

  it("refuses a quote, which cmd cannot escape", () => {
    expect(() => cmdLine(['a"b'])).toThrow();
  });
});

describe("vscodeCandidates", () => {
  it("tries the per-user install before the one for everyone", () => {
    expect(vscodeCandidates({ LOCALAPPDATA: "C:\\Users\\me\\AppData\\Local", ProgramFiles: "C:\\Program Files" })).toEqual([
      "C:\\Users\\me\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe",
      "C:\\Program Files\\Microsoft VS Code\\Code.exe",
    ]);
  });
});
