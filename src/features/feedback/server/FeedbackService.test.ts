import { describe, expect, it } from "vitest";
import { staleScreenshots } from "@/features/feedback/server/FeedbackService";

const shot = (day: number) => `2026-11-${String(day).padStart(2, "0")}T10-00-00-000Z.png`;

describe("staleScreenshots", () => {
  it("picks the screenshots older than the newest ones kept", () => {
    expect(staleScreenshots([shot(3), shot(1), shot(4), shot(2)], 2)).toEqual([shot(2), shot(1)]);
  });

  it("keeps everything up to the limit and ignores files it did not write", () => {
    expect(staleScreenshots([shot(1), shot(2)], 2)).toEqual([]);
    expect(staleScreenshots(["notes.txt", "x.png.123.tmp", shot(1)], 0)).toEqual([shot(1)]);
  });
});
