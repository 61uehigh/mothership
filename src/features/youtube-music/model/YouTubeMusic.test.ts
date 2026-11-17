import { describe, expect, it } from "vitest";
import { parseIsoDuration } from "@/features/youtube-music/model/YouTubeMusic";
import { stepIndex } from "@/features/youtube-music/model/queue";

const track = (videoId: string) => ({ videoId, title: videoId, artist: undefined, durationSeconds: undefined, thumbnail: undefined });

describe("parseIsoDuration", () => {
  it("reads the Data API's ISO 8601 durations and nothing else", () => {
    expect(parseIsoDuration("PT3M25S")).toBe(205);
    expect(parseIsoDuration("PT1H2M")).toBe(3720);
    expect(parseIsoDuration("PT45S")).toBe(45);
    expect(parseIsoDuration("P1DT1S")).toBe(86_401);
    expect(parseIsoDuration("P0D")).toBe(0);
    expect(parseIsoDuration("PT")).toBeUndefined();
    expect(parseIsoDuration("3:25")).toBeUndefined();
  });
});

describe("stepIndex", () => {
  const queue = ["a", "b", "c", "d"].map(track);

  it("skips songs the player refused", () => {
    expect(stepIndex(queue, 0, 1, new Set(["b", "c"]))).toBe(3);
    expect(stepIndex(queue, 3, -1, new Set(["c", "b"]))).toBe(0);
  });

  it("answers undefined past either end", () => {
    expect(stepIndex(queue, 3, 1, new Set())).toBeUndefined();
    expect(stepIndex(queue, 0, -1, new Set())).toBeUndefined();
    expect(stepIndex(queue, 2, 1, new Set(["d"]))).toBeUndefined();
  });

  it("finds the first playable song from before the start", () => {
    expect(stepIndex(queue, -1, 1, new Set(["a"]))).toBe(1);
  });
});
