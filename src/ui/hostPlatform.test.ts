import { afterEach, describe, expect, it, vi } from "vitest";
import { hostPlatform, serverPlatform } from "@/ui/hostPlatform";

function browser(attribute: string | null, userAgent: string) {
  vi.stubGlobal("window", {});
  vi.stubGlobal("navigator", { userAgent });
  vi.stubGlobal("document", { documentElement: { getAttribute: () => attribute } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("hostPlatform", () => {
  it("renders the build's target platform on the server, so a Windows build made on a Mac says win32", () => {
    vi.stubEnv("MOTHERSHIP_TARGET_PLATFORM", "win32");
    expect(hostPlatform()).toBe("win32");
    expect(serverPlatform()).toBe("win32");
  });

  it("reads what the server rendered in the browser, even when the user agent disagrees", () => {
    browser("win32", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)");
    expect(hostPlatform()).toBe("win32");
  });

  it("falls back to the user agent when the page has no attribute", () => {
    browser(null, "Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
    expect(hostPlatform()).toBe("win32");
    browser(null, "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)");
    expect(hostPlatform()).toBe("darwin");
  });
});
