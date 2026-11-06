import { randomUUID } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { processState } from "@/platform/processState";

/**
 * ### writeFileAtomic
 *
 * Writes `text` to a temporary file next to `file` and renames it into place,
 * so a crash never leaves a half-written file. The temporary name is unique
 * per write, so two writes at once never share it. Creates the folder if needed.
 *
 * @param options - `mode`: permissions for a new file, e.g. `0o600` for one only you may read.
 */
export async function writeFileAtomic(file: string, text: string, options: { mode?: number } = {}): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, text, options.mode === undefined ? undefined : { mode: options.mode });
  await rename(temporary, file);
}

/**
 * ### toJsonFile
 *
 * @returns `value` as pretty-printed JSON with a trailing newline, as the data folder's files are kept.
 */
export function toJsonFile(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/**
 * ### WriteQueue
 *
 * Runs the tasks it is given one after another. A failed task rejects its
 * own caller and does not stop the next one.
 */
export type WriteQueue = <T>(task: () => Promise<T>) => Promise<T>;

function createWriteQueue(): WriteQueue {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const result = tail.then(task);
    tail = result.catch(() => undefined);
    return result;
  };
}

/**
 * ### writeQueueFor
 *
 * The one queue for read-change-write tasks on `file`, shared by every
 * module and route in this server, so two quick changes to the same file
 * cannot overwrite each other.
 */
export function writeQueueFor(file: string): WriteQueue {
  const queues = processState("files.writeQueues", () => new Map<string, WriteQueue>());
  const key = path.resolve(/*turbopackIgnore: true*/ file);
  let queue = queues.get(key);
  if (queue === undefined) {
    queue = createWriteQueue();
    queues.set(key, queue);
  }
  return queue;
}
