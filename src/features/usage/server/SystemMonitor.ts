import { statfs } from "node:fs/promises";
import { cpus, freemem, hostname, loadavg, release, totalmem, uptime } from "node:os";
import type { SystemSnapshot } from "@/features/usage/model/System";
import { CpuMeter } from "@/features/usage/server/CpuMeter";
import { diskFromStatfs, parseBattery, parseHardware, parsePressure, parseSwap, parseVmStat } from "@/features/usage/server/systemParse";
import { CliBinary } from "@/platform/cli";

/** A snapshot this recent is reused, so several open pages cost one round of commands. */
const CACHE_MS = 2_000;
/** The first snapshot has no earlier CPU reading, so it waits this long for one. */
const FIRST_CPU_WINDOW_MS = 300;
const RUN = { env: process.env, timeoutMs: 5_000, maxBuffer: 1024 * 1024 };
/** On a Mac the data volume holds your files; `/` is the sealed system volume. */
const DATA_VOLUMES = ["/System/Volumes/Data", "/"];

const scutil = new CliBinary(["/usr/sbin/scutil", "scutil"]);
const systemProfiler = new CliBinary(["/usr/sbin/system_profiler", "system_profiler"]);
const swVers = new CliBinary(["/usr/bin/sw_vers", "sw_vers"]);
const vmStat = new CliBinary(["/usr/bin/vm_stat", "vm_stat"]);
const sysctl = new CliBinary(["/usr/sbin/sysctl", "sysctl"]);
const pmset = new CliBinary(["/usr/bin/pmset", "pmset"]);

/** A command's output, or `undefined` when it is missing or fails: every field it feeds is optional. */
async function output(binary: CliBinary, args: Array<string>): Promise<string | undefined> {
  const outcome = await binary.run(args, RUN);
  return outcome.kind === "ok" ? outcome.value : undefined;
}

type Identity = Pick<SystemSnapshot, "name" | "model" | "modelId" | "chip" | "os">;

async function identity(): Promise<Identity> {
  if (process.platform !== "darwin") return { name: hostname(), model: undefined, modelId: undefined, chip: cpus()[0]?.model, os: `${process.platform} ${release()}` };
  const [name, hardware, version] = await Promise.all([
    output(scutil, ["--get", "ComputerName"]),
    output(systemProfiler, ["SPHardwareDataType", "-json"]),
    output(swVers, ["-productVersion"]),
  ]);
  return {
    name: name?.trim() || hostname(),
    ...parseHardware(hardware ?? ""),
    os: version === undefined ? `Darwin ${release()}` : `macOS ${version.trim()}`,
  };
}

async function disk(): Promise<SystemSnapshot["disk"]> {
  for (const volume of DATA_VOLUMES) {
    try {
      return diskFromStatfs(volume, await statfs(/*turbopackIgnore: true*/ volume));
    } catch {
      // Not a Mac, or this volume is missing: try the next.
    }
  }
  return undefined;
}

/**
 * ### SystemMonitor
 *
 * Reads this computer for Settings → This Mac: what it is (asked once), and
 * CPU, memory, disk, battery, and uptime (asked on each snapshot, cached for
 * two seconds). Uses Node's `os` and quick macOS commands; anything a
 * command can't tell is left out rather than failing the snapshot.
 */
export class SystemMonitor {
  #identity: Promise<Identity> | undefined;
  #cpu = new CpuMeter();
  #latest: { at: number; snapshot: Promise<SystemSnapshot> } | undefined;

  /**
   * ### snapshot
   *
   * @returns Current numbers; CPU is the average since the previous snapshot
   *   (the first one has none).
   */
  snapshot(): Promise<SystemSnapshot> {
    const now = Date.now();
    if (this.#latest !== undefined && now - this.#latest.at < CACHE_MS) return this.#latest.snapshot;
    const snapshot = this.#read();
    this.#latest = { at: now, snapshot };
    // A failed read is not cached.
    snapshot.catch(() => {
      if (this.#latest?.snapshot === snapshot) this.#latest = undefined;
    });
    return snapshot;
  }

  async #read(): Promise<SystemSnapshot> {
    this.#identity ??= identity();
    const mac = process.platform === "darwin";
    const firstCpu = this.#cpu.primed ? undefined : new Promise((resolve) => setTimeout(resolve, FIRST_CPU_WINDOW_MS));
    if (firstCpu !== undefined) this.#cpu.percent();
    const [who, vm, pressure, swap, battery, volume] = await Promise.all([
      this.#identity,
      mac ? output(vmStat, []) : undefined,
      mac ? output(sysctl, ["-n", "kern.memorystatus_vm_pressure_level"]) : undefined,
      mac ? output(sysctl, ["-n", "vm.swapusage"]) : undefined,
      mac ? output(pmset, ["-g", "batt"]) : undefined,
      disk(),
      firstCpu,
    ]);
    const total = totalmem();
    const split = vm === undefined ? { used: total - freemem(), app: undefined, wired: undefined, compressed: undefined, cached: undefined } : parseVmStat(vm, total);
    const memory = process.memoryUsage();
    const load = loadavg();
    return {
      ...who,
      cpu: { percent: this.#cpu.percent(), cores: cpus().length, loadAverage: [load[0], load[1], load[2]] },
      memory: {
        total,
        ...split,
        pressure: pressure === undefined ? undefined : parsePressure(pressure),
        swap: swap === undefined ? undefined : parseSwap(swap),
      },
      disk: volume,
      uptimeSeconds: uptime(),
      battery: battery === undefined ? undefined : parseBattery(battery),
      process: { rss: memory.rss, heapUsed: memory.heapUsed, uptimeSeconds: process.uptime() },
      observedAt: Date.now(),
    };
  }

}
