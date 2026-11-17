import { describe, expect, it } from "vitest";
import { formatBytes, formatDuration, relativeTime } from "@/ui/format";

describe("formatDuration", () => {
  it("keeps the two largest units", () => {
    expect(formatDuration((2 * 60 + 13) * 60_000)).toBe("2h 13m");
    expect(formatDuration(((3 * 24 + 4) * 60 + 30) * 60_000)).toBe("3d 4h");
  });

  it("drops a zero second unit", () => {
    expect(formatDuration(2 * 60 * 60_000)).toBe("2h");
    expect(formatDuration(5 * 24 * 60 * 60_000)).toBe("5d");
  });

  it("shows minutes alone, and under a minute", () => {
    expect(formatDuration(45 * 60_000)).toBe("45m");
    expect(formatDuration(30_000)).toBe("under 1m");
    expect(formatDuration(-5_000)).toBe("under 1m");
  });
});

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

describe("relativeTime", () => {
  it("reads past and future", () => {
    expect(relativeTime(0, 5 * 60_000)).toBe("5m ago");
    expect(relativeTime(2 * 60 * 60_000, 0)).toBe("in 2h");
  });
});
