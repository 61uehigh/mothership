import { describe, expect, it } from "vitest";
import { describeZone, formatOffset, listTimeZones, matchesZone, offsetMinutesOf, zoneLabel } from "@/features/settings/ui/timeZones";

const JANUARY = new Date("2026-01-15T12:00:00Z");
const JULY = new Date("2026-07-15T12:00:00Z");

describe("offsetMinutesOf", () => {
  it("reads whole, half, and quarter hour offsets on both sides of UTC", () => {
    expect(offsetMinutesOf("Asia/Seoul", JANUARY)).toBe(540);
    expect(offsetMinutesOf("Asia/Kolkata", JANUARY)).toBe(330);
    expect(offsetMinutesOf("Asia/Kathmandu", JANUARY)).toBe(345);
    expect(offsetMinutesOf("America/St_Johns", JANUARY)).toBe(-210);
    expect(offsetMinutesOf("UTC", JANUARY)).toBe(0);
  });

  it("follows daylight saving time at the given moment", () => {
    expect(offsetMinutesOf("America/New_York", JANUARY)).toBe(-300);
    expect(offsetMinutesOf("America/New_York", JULY)).toBe(-240);
  });

  it("treats an unknown zone as UTC rather than throwing", () => {
    expect(offsetMinutesOf("Mars/Olympus", JANUARY)).toBe(0);
  });
});

describe("formatOffset", () => {
  it("pads hours and minutes and uses a true minus sign", () => {
    expect(formatOffset(540)).toBe("UTC+09:00");
    expect(formatOffset(-210)).toBe("UTC−03:30");
    expect(formatOffset(0)).toBe("UTC±00:00");
    expect(formatOffset(765)).toBe("UTC+12:45");
  });
});

describe("describeZone", () => {
  it("splits region and city and spells out underscores", () => {
    expect(zoneLabel(describeZone("Asia/Seoul", JANUARY))).toBe("Seoul (UTC+09:00)");
    expect(describeZone("America/Argentina/Buenos_Aires", JANUARY)).toMatchObject({ region: "America", city: "Argentina / Buenos Aires" });
    expect(describeZone("UTC", JANUARY)).toMatchObject({ region: "", city: "UTC", offset: "UTC±00:00" });
  });
});

describe("listTimeZones", () => {
  it("sorts west to east, then by region and city, and adds missing extras once", () => {
    const ids = listTimeZones(["Asia/Seoul", "America/New_York", "Asia/Tokyo", "Europe/London"], ["UTC", "Asia/Seoul", ""], JANUARY).map((z) => z.id);
    expect(ids).toEqual(["America/New_York", "UTC", "Europe/London", "Asia/Seoul", "Asia/Tokyo"]);
  });
});

describe("matchesZone", () => {
  const seoul = describeZone("Asia/Seoul", JANUARY);
  const kolkata = describeZone("Asia/Kolkata", JANUARY);
  const stJohns = describeZone("America/St_Johns", JANUARY);
  const utc = describeZone("UTC", JANUARY);

  it("matches city, region, and id words in any order, ignoring case and separators", () => {
    expect(matchesZone(seoul, "seoul")).toBe(true);
    expect(matchesZone(seoul, "Seoul asia")).toBe(true);
    expect(matchesZone(seoul, "asia/seo")).toBe(true);
    expect(matchesZone(stJohns, "st johns")).toBe(true);
    expect(matchesZone(stJohns, "st_johns")).toBe(true);
    expect(matchesZone(seoul, "tokyo")).toBe(false);
    expect(matchesZone(seoul, "  ")).toBe(true);
  });

  it("matches an offset with or without UTC, leading zeros, or minutes", () => {
    expect(matchesZone(seoul, "+9")).toBe(true);
    expect(matchesZone(seoul, "utc+09")).toBe(true);
    expect(matchesZone(seoul, "+09:00")).toBe(true);
    expect(matchesZone(seoul, "-9")).toBe(false);
    expect(matchesZone(kolkata, "+5")).toBe(true);
    expect(matchesZone(kolkata, "+5:30")).toBe(true);
    expect(matchesZone(kolkata, "+0530")).toBe(true);
    expect(matchesZone(kolkata, "+5:00")).toBe(false);
    expect(matchesZone(stJohns, "-3")).toBe(true);
    expect(matchesZone(stJohns, "−03:30")).toBe(true);
    expect(matchesZone(utc, "+0")).toBe(true);
    expect(matchesZone(seoul, "+0")).toBe(false);
  });
});
