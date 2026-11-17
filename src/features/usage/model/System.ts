/**
 * ### MemoryPressure
 *
 * macOS's own judgment of memory: `normal`, `warning` (it is compressing and
 * swapping more), or `critical`.
 */
export type MemoryPressure = "normal" | "warning" | "critical";

/**
 * ### MemoryInfo
 *
 * Memory in bytes. `used` excludes cache macOS gives back on demand, as the
 * status bar's MEM does; `cached` is that cache.
 */
export type MemoryInfo = {
  total: number;
  used: number;
  /** Memory apps hold (anonymous pages). `undefined` off macOS. */
  app: number | undefined;
  /** Memory the system keeps for itself and can't page out. */
  wired: number | undefined;
  /** Memory taken by the compressor. */
  compressed: number | undefined;
  /** File cache and other memory reclaimed on demand. */
  cached: number | undefined;
  pressure: MemoryPressure | undefined;
  /** Swap on disk; `undefined` when unknown. */
  swap: { used: number; total: number } | undefined;
};

/**
 * ### DiskInfo
 *
 * The data volume, in bytes.
 */
export type DiskInfo = {
  /** Where it was measured, e.g. `/System/Volumes/Data`. */
  path: string;
  total: number;
  free: number;
  used: number;
};

/**
 * ### BatteryInfo
 *
 * From `pmset -g batt`.
 */
export type BatteryInfo = {
  /** 0–100. */
  percent: number;
  /** As macOS words it, e.g. `charging`, `discharging`, `charged`, `AC attached`. */
  state: string;
  /** `AC Power` or `Battery Power`. */
  source: string | undefined;
  /** Minutes to full or empty; `undefined` while macOS is still estimating. */
  minutesRemaining: number | undefined;
};

/**
 * ### SystemSnapshot
 *
 * This computer for the This computer tab. Fields this machine can't report are `undefined`.
 */
export type SystemSnapshot = {
  /** The computer's name, e.g. "Jane's MacBook Pro". */
  name: string;
  /** E.g. "MacBook Pro". */
  model: string | undefined;
  /** E.g. "Mac17,9". */
  modelId: string | undefined;
  /** E.g. "Apple M5 Pro". */
  chip: string | undefined;
  /** E.g. "macOS 26.6". */
  os: string;
  cpu: {
    /** Whole-machine use since the previous snapshot, 0–100; `undefined` on the first one. */
    percent: number | undefined;
    cores: number;
    /** 1-, 5- and 15-minute load averages; `undefined` on Windows, which has none (Node reports zeros there). */
    loadAverage: [number, number, number] | undefined;
  };
  memory: MemoryInfo;
  disk: DiskInfo | undefined;
  /** Seconds since the computer started. */
  uptimeSeconds: number;
  /** `undefined` on a computer without a battery. */
  battery: BatteryInfo | undefined;
  /** mothership's server process. */
  process: { rss: number; heapUsed: number; uptimeSeconds: number };
  /** Epoch milliseconds these numbers were taken. */
  observedAt: number;
};
