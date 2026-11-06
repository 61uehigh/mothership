import { existsSync } from "node:fs";
import { open } from "node:fs/promises";
import { dataPath } from "@/platform/paths";

/** The desktop app's log, else `pnpm autostart`'s. */
const serverLogFiles = () => [dataPath("logs", "server.log"), dataPath(".mothership", "server.log")];
const TAIL_BYTES = 64 * 1024;

/**
 * ### serverLogTail
 *
 * Reads only the last 64 KB, so a long-running server's log is never read whole.
 *
 * @returns The last `count` non-empty lines of the server log, or none when there is no log file.
 */
export async function serverLogTail(count: number): Promise<Array<string>> {
  const file = serverLogFiles().find((candidate) => existsSync(candidate));
  if (file === undefined) return [];
  const handle = await open(file, "r");
  try {
    const { size } = await handle.stat();
    const start = Math.max(0, size - TAIL_BYTES);
    const buffer = Buffer.alloc(size - start);
    await handle.read(buffer, 0, buffer.length, start);
    return buffer
      .toString("utf8")
      .split("\n")
      .filter((line) => line.trim() !== "")
      .slice(-count);
  } finally {
    await handle.close();
  }
}
