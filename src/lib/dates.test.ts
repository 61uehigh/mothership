import { describe, expect, it } from "vitest";
import { addDays, zonedDate, zonedMidnight, zonedMinutes } from "@/lib/dates";

describe("zonedMidnight", () => {
  it("finds local midnight in a zone", () => {
    expect(new Date(zonedMidnight("2026-10-23", "Asia/Seoul")).toISOString()).toBe("2026-10-22T15:00:00.000Z");
    expect(new Date(zonedMidnight("2026-10-23", "America/Los_Angeles")).toISOString()).toBe("2026-10-23T07:00:00.000Z");
  });

  it("finds local midnight on daylight-saving change days east of UTC", () => {
    // Sydney leaves daylight saving on 2026-04-05 (03:00 → 02:00) and starts it on 2026-10-04 (02:00 → 03:00).
    expect(new Date(zonedMidnight("2026-04-05", "Australia/Sydney")).toISOString()).toBe("2026-04-04T13:00:00.000Z");
    expect(new Date(zonedMidnight("2026-10-04", "Australia/Sydney")).toISOString()).toBe("2026-10-03T14:00:00.000Z");
  });

  it("finds local midnight on daylight-saving change days west of UTC", () => {
    expect(new Date(zonedMidnight("2026-03-08", "America/Los_Angeles")).toISOString()).toBe("2026-03-08T08:00:00.000Z");
    expect(new Date(zonedMidnight("2026-11-01", "America/Los_Angeles")).toISOString()).toBe("2026-11-01T07:00:00.000Z");
  });
});

describe("zonedDate", () => {
  it("puts an instant near midnight on the day of the given zone", () => {
    // 00:30 on Nov 4 in Seoul is still the afternoon of Nov 3 in Los Angeles.
    const halfPastMidnightSeoul = Date.parse("2026-11-03T15:30:00Z");
    expect(zonedDate(halfPastMidnightSeoul, "Asia/Seoul")).toBe("2026-11-04");
    expect(zonedDate(halfPastMidnightSeoul, "America/Los_Angeles")).toBe("2026-11-03");
    expect(zonedDate(Date.parse("2026-11-03T14:59:59Z"), "Asia/Seoul")).toBe("2026-11-03");
  });

  it("reads the date in the given zone, not the machine's", () => {
    const lateUtc = Date.parse("2026-11-25T20:00:00Z");
    expect(zonedDate(lateUtc, "Asia/Seoul")).toBe("2026-11-26");
    expect(zonedDate(lateUtc, "America/Los_Angeles")).toBe("2026-11-25");
  });
});

describe("zonedMinutes", () => {
  it("counts from local midnight, which is 0 rather than 24:00", () => {
    expect(zonedMinutes(Date.parse("2026-11-03T15:00:00Z"), "Asia/Seoul")).toBe(0);
    expect(zonedMinutes(Date.parse("2026-11-03T15:30:00Z"), "America/Los_Angeles")).toBe(7 * 60 + 30);
  });
});

describe("addDays", () => {
  it("crosses month, year, and leap-day boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
    expect(addDays("2026-01-01", -365)).toBe("2025-01-01");
  });

  it("steps over a daylight-saving change one calendar day at a time", () => {
    // US clocks went forward on 2026-03-08; a 24-hour step from local midnight would land on the wrong day in such zones.
    expect(addDays("2026-03-07", 1)).toBe("2026-03-08");
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
  });
});
