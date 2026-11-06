import { describe, expect, it } from "vitest";
import { durationIn, relativeTimeIn } from "@/ui/i18n/format";

const NOW = 1_000_000_000_000;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** The label with its no-break spaces read as spaces, for comparing the words. */
const words = (label: string) => label.replaceAll(" ", " ");

describe("relativeTimeIn", () => {
  it("reads past and future in each language", () => {
    expect(words(relativeTimeIn("en", NOW - 5 * MINUTE, NOW))).toBe("5m ago");
    expect(words(relativeTimeIn("en", NOW + 2 * HOUR, NOW))).toBe("in 2h");
    expect(words(relativeTimeIn("ko", NOW - 5 * MINUTE, NOW))).toBe("5분 전");
    expect(words(relativeTimeIn("ko", NOW + 2 * HOUR, NOW))).toBe("2시간 후");
    expect(words(relativeTimeIn("ko", NOW - 3 * DAY, NOW))).toBe("3일 전");
  });

  it("says just now or soon under a minute", () => {
    expect(words(relativeTimeIn("en", NOW - 30_000, NOW))).toBe("just now");
    expect(relativeTimeIn("en", NOW + 30_000, NOW)).toBe("soon");
    expect(relativeTimeIn("ko", NOW - 30_000, NOW)).toBe("방금");
  });
});

describe("durationIn", () => {
  it("keeps the two largest units", () => {
    expect(words(durationIn("en", 2 * HOUR + 13 * MINUTE))).toBe("2h 13m");
    expect(words(durationIn("en", 3 * DAY + 4 * HOUR + 30 * MINUTE))).toBe("3d 4h");
    expect(words(durationIn("ko", 2 * HOUR + 13 * MINUTE))).toBe("2시간 13분");
  });

  it("drops a zero second unit", () => {
    expect(durationIn("en", 2 * HOUR)).toBe("2h");
    expect(durationIn("ko", 5 * DAY)).toBe("5일");
  });

  it("shows minutes alone, and under a minute, with negative as zero", () => {
    expect(durationIn("en", 45 * MINUTE)).toBe("45m");
    expect(words(durationIn("en", 30_000))).toBe("under 1m");
    expect(words(durationIn("ko", -5_000))).toBe("1분 미만");
  });
});

describe("time labels", () => {
  it("never contain a space a narrow row could wrap at", () => {
    const labels = (["en", "ko"] as const).flatMap((locale) => [
      relativeTimeIn(locale, NOW - 5 * MINUTE, NOW),
      relativeTimeIn(locale, NOW + 3 * DAY, NOW),
      relativeTimeIn(locale, NOW - 30_000, NOW),
      durationIn(locale, 2 * HOUR + 13 * MINUTE),
      durationIn(locale, 30_000),
    ]);
    for (const label of labels) expect(label, label).not.toMatch(/ /);
  });
});
