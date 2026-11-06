import { describe, expect, it } from "vitest";
import { hasFiveHourLimit, type ProviderUsage } from "@/features/usage/model/Usage";

const weekly = { id: "primary", minutes: 10_080, usedPercent: 15, resetsAt: undefined };
const fiveHourWindow = { usedPercent: 40, resetsAt: undefined };
const fiveHour = { id: "primary", minutes: 300, ...fiveHourWindow };
const usage = (over: Partial<ProviderUsage>): ProviderUsage => ({ fiveHour: undefined, weekly: undefined, windows: [], plan: undefined, observedAt: 0, ...over });

describe("hasFiveHourLimit", () => {
  it("shows the meter while nothing is known", () => {
    expect(hasFiveHourLimit(undefined)).toBe(true);
    expect(hasFiveHourLimit(usage({}))).toBe(true);
  });

  it("shows the meter when a 5-hour window was reported, whatever the plan", () => {
    expect(hasFiveHourLimit(usage({ fiveHour: fiveHourWindow, windows: [fiveHour, { ...weekly, id: "secondary" }], plan: "team" }))).toBe(true);
    expect(hasFiveHourLimit(usage({ fiveHour: fiveHourWindow, windows: [fiveHour], plan: "pro" }))).toBe(true);
  });

  it("drops the meter when the record reports windows but no 5-hour one", () => {
    expect(hasFiveHourLimit(usage({ weekly, windows: [weekly], plan: "self_serve_business_prolite" }))).toBe(false);
    expect(hasFiveHourLimit(usage({ weekly, windows: [weekly], plan: undefined }))).toBe(false);
  });
});
