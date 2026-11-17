import { describe, expect, it } from "vitest";
import { formatBytes } from "@/ui/format";

describe("formatBytes", () => {
  it("uses binary units with one decimal below 100", () => {
    expect(formatBytes(48 * 1024 ** 3)).toBe("48.0 GB");
    expect(formatBytes(1.5 * 1024 ** 2)).toBe("1.5 MB");
  });

  it("drops the decimal from 100 up and for bytes", () => {
    expect(formatBytes(512 * 1024 ** 2)).toBe("512 MB");
    expect(formatBytes(900)).toBe("900 B");
  });
});
