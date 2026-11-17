import { describe, expect, it } from "vitest";
import { diskFromStatfs, parseBattery, parseHardware, parsePressure, parseSwap, parseVmStat } from "@/features/usage/server/systemParse";

describe("parseBattery", () => {
  it("reads a charging battery with an estimate", () => {
    const text = "Now drawing from 'AC Power'\n -InternalBattery-0 (id=22872163)\t85%; charging; 1:23 remaining present: true\n";
    expect(parseBattery(text)).toEqual({ percent: 85, state: "charging", source: "AC Power", minutesRemaining: 83 });
  });

  it("treats 0:00 on a full battery as no estimate", () => {
    const text = "Now drawing from 'AC Power'\n -InternalBattery-0 (id=1)\t100%; charged; 0:00 remaining present: true\n";
    expect(parseBattery(text)).toEqual({ percent: 100, state: "charged", source: "AC Power", minutesRemaining: undefined });
  });

  it("reads a battery still estimating", () => {
    const text = "Now drawing from 'Battery Power'\n -InternalBattery-0 (id=1)\t42%; discharging; (no estimate) present: true\n";
    expect(parseBattery(text)).toEqual({ percent: 42, state: "discharging", source: "Battery Power", minutesRemaining: undefined });
  });

  it("finds no battery on a desktop Mac", () => {
    expect(parseBattery("Now drawing from 'AC Power'\n")).toBeUndefined();
  });
});

describe("parseVmStat", () => {
  const text = [
    "Mach Virtual Memory Statistics: (page size of 16384 bytes)",
    "Pages free:                                    1000.",
    "Pages active:                                  4000.",
    "Pages inactive:                                2000.",
    "Pages speculative:                              500.",
    "Pages wired down:                              1500.",
    "Pages purgeable:                                100.",
    "Anonymous pages:                               3600.",
    "Pages occupied by compressor:                   800.",
  ].join("\n");
  const page = 16384;
  const total = 10_000 * page;

  it("leaves reclaimable cache out of used", () => {
    // Available: free + inactive + speculative + purgeable = 3600 pages.
    expect(parseVmStat(text, total).used).toBe(6400 * page);
  });

  it("splits memory as Activity Monitor does", () => {
    expect(parseVmStat(text, total)).toMatchObject({
      app: 3500 * page,
      wired: 1500 * page,
      compressed: 800 * page,
      cached: 2600 * page,
    });
  });
});

describe("parsePressure", () => {
  it("maps macOS's levels", () => {
    expect(parsePressure("1\n")).toBe("normal");
    expect(parsePressure("2")).toBe("warning");
    expect(parsePressure("4")).toBe("critical");
    expect(parsePressure("")).toBeUndefined();
  });
});

describe("parseSwap", () => {
  it("reads sizes with units", () => {
    expect(parseSwap("total = 2048.00M  used = 1024.00M  free = 1024.00M  (encrypted)")).toEqual({ used: 1024 ** 3, total: 2 * 1024 ** 3 });
  });

  it("reads no swap", () => {
    expect(parseSwap("total = 0.00M  used = 0.00M  free = 0.00M  (encrypted)")).toEqual({ used: 0, total: 0 });
  });

  it("gives up on other text", () => {
    expect(parseSwap("unknown oid")).toBeUndefined();
  });
});

describe("diskFromStatfs", () => {
  it("counts everything not free as used", () => {
    expect(diskFromStatfs("/System/Volumes/Data", { bsize: 4096, blocks: 1000, bavail: 250 })).toEqual({
      path: "/System/Volumes/Data",
      total: 4_096_000,
      free: 1_024_000,
      used: 3_072_000,
    });
  });
});

describe("parseHardware", () => {
  it("reads the model and chip, and nothing identifying", () => {
    const json = JSON.stringify({
      SPHardwareDataType: [{ machine_name: "MacBook Pro", machine_model: "Mac17,9", chip_type: "Apple M5 Pro", serial_number: "SECRET" }],
    });
    expect(parseHardware(json)).toEqual({ model: "MacBook Pro", modelId: "Mac17,9", chip: "Apple M5 Pro" });
  });

  it("uses the processor name on Intel Macs", () => {
    const json = JSON.stringify({ SPHardwareDataType: [{ machine_name: "iMac", cpu_type: "8-Core Intel Core i9" }] });
    expect(parseHardware(json).chip).toBe("8-Core Intel Core i9");
  });

  it("gives nothing for unexpected output", () => {
    expect(parseHardware("not json")).toEqual({ model: undefined, modelId: undefined, chip: undefined });
  });
});
