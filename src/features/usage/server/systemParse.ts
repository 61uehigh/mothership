// Pure readers for the macOS commands behind Settings → This Mac, kept apart so tests can feed them sample output.
import { z } from "zod";
import type { BatteryInfo, DiskInfo, MemoryInfo, MemoryPressure } from "@/features/usage/model/System";

/**
 * ### parseBattery
 *
 * @param text - Output of `pmset -g batt`, e.g.
 *   `Now drawing from 'AC Power'` then ` -InternalBattery-0 (id=…)\t85%; charging; 1:23 remaining present: true`.
 * @returns The internal battery, or `undefined` when there is none.
 */
export function parseBattery(text: string): BatteryInfo | undefined {
  const line = /InternalBattery[^\t]*\t\s*(\d+)%;\s*([^;]+);\s*(.*)/.exec(text);
  if (line === null) return undefined;
  const remaining = /(\d+):(\d{2}) remaining/.exec(line[3]);
  const minutes = remaining === null ? undefined : Number(remaining[1]) * 60 + Number(remaining[2]);
  return {
    percent: Number(line[1]),
    state: line[2].trim(),
    source: /drawing from '([^']+)'/.exec(text)?.[1],
    // "0:00 remaining" on a full battery means nothing is left to do, not an estimate.
    minutesRemaining: minutes === 0 ? undefined : minutes,
  };
}

/**
 * ### parseVmStat
 *
 * @param text - Output of `vm_stat`.
 * @param total - Physical memory in bytes (`os.totalmem()`).
 * @returns Used memory without reclaimable cache, and how it splits, in bytes.
 */
export function parseVmStat(text: string, total: number): Pick<MemoryInfo, "used" | "app" | "wired" | "compressed" | "cached"> {
  const pageSize = Number(/page size of (\d+) bytes/.exec(text)?.[1] ?? 16384);
  const pages = (label: string) => Number(new RegExp(`${label}:\\s+(\\d+)`).exec(text)?.[1] ?? 0) * pageSize;
  // Free plus cache macOS reclaims on demand; os.freemem() alone overstates use.
  const available = pages("Pages free") + pages("Pages inactive") + pages("Pages speculative") + pages("Pages purgeable");
  const app = Math.max(pages("Anonymous pages") - pages("Pages purgeable"), 0);
  const wired = pages("Pages wired down");
  const compressed = pages("Pages occupied by compressor");
  const used = Math.max(total - available, 0);
  return { used, app, wired, compressed, cached: Math.max(total - used - pages("Pages free"), 0) };
}

/**
 * ### parsePressure
 *
 * @param text - Output of `sysctl -n kern.memorystatus_vm_pressure_level`: 1, 2, or 4.
 */
export function parsePressure(text: string): MemoryPressure | undefined {
  switch (text.trim()) {
    case "1":
      return "normal";
    case "2":
      return "warning";
    case "4":
      return "critical";
    default:
      return undefined;
  }
}

const UNIT: Record<string, number> = { K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4 };

/**
 * ### parseSwap
 *
 * @param text - Output of `sysctl -n vm.swapusage`, e.g. `total = 2048.00M  used = 1018.25M  free = 1029.75M  (encrypted)`.
 * @returns Swap in bytes, or `undefined` when the text has no totals.
 */
export function parseSwap(text: string): { used: number; total: number } | undefined {
  const size = (label: string) => {
    const match = new RegExp(`${label} = ([\\d.]+)([KMGT])`).exec(text);
    return match === null ? undefined : Number(match[1]) * UNIT[match[2]];
  };
  const total = size("total");
  const used = size("used");
  return total === undefined || used === undefined ? undefined : { used, total };
}

/**
 * ### diskFromStatfs
 *
 * @param stats - What `fs.statfs` returns: block size, block count, and blocks available to us.
 * @returns The volume in bytes. Used counts everything not free, so it matches Finder on APFS,
 *   where volumes share one container.
 */
export function diskFromStatfs(path: string, stats: { bsize: number; blocks: number; bavail: number }): DiskInfo {
  const total = stats.blocks * stats.bsize;
  const free = stats.bavail * stats.bsize;
  return { path, total, free, used: Math.max(total - free, 0) };
}

const hardwareSchema = z.object({
  SPHardwareDataType: z
    .array(z.object({ machine_name: z.string().optional(), machine_model: z.string().optional(), chip_type: z.string().optional(), cpu_type: z.string().optional() }))
    .min(1),
});

/**
 * ### parseHardware
 *
 * @param json - Output of `system_profiler SPHardwareDataType -json`.
 * @returns The model ("MacBook Pro"), its identifier ("Mac17,9"), and the chip; each `undefined` when missing.
 *   Serial numbers and other identifiers in the output are not read.
 */
export function parseHardware(json: string): { model: string | undefined; modelId: string | undefined; chip: string | undefined } {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    // Not JSON: an older macOS or a failed command; the page shows what else it knows.
    return { model: undefined, modelId: undefined, chip: undefined };
  }
  const parsed = hardwareSchema.safeParse(raw);
  if (!parsed.success) return { model: undefined, modelId: undefined, chip: undefined };
  const hardware = parsed.data.SPHardwareDataType[0];
  // Intel Macs name the processor in cpu_type instead of chip_type.
  return { model: hardware.machine_name, modelId: hardware.machine_model, chip: hardware.chip_type ?? hardware.cpu_type };
}
