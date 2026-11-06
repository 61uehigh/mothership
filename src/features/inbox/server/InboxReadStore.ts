import { readFile, rename } from "node:fs/promises";
import { z } from "zod";
import type { InboxReadState } from "@/features/inbox/model/Inbox";
import { toJsonFile, writeFileAtomic, writeQueueFor } from "@/platform/files";
import { dataPath } from "@/platform/paths";
import { isMissingFile } from "@/lib/errors";

/** Marks older than this are dropped when the file is next written, so it does not grow forever. */
const KEEP_MARKS_MS = 90 * 24 * 60 * 60 * 1000;

const stateSchema = z.object({
  since: z.number(),
  marks: z.record(z.string(), z.object({ read: z.boolean(), at: z.number() })),
});

/**
 * ### pruneMarks
 *
 * @returns `marks` without those made more than 90 days before `now`.
 */
export function pruneMarks(marks: InboxReadState["marks"], now: number): InboxReadState["marks"] {
  return Object.fromEntries(Object.entries(marks).filter(([, mark]) => now - mark.at < KEEP_MARKS_MS));
}

/**
 * ### InboxReadStore
 *
 * Which Inbox items you have read, kept in `.mothership/inbox-read.json`
 * (mothership's own record: Slack search and the calendar cannot say what
 * you read). Linear notifications are also marked in Linear itself, by
 * InboxService, not by this store.
 */
export class InboxReadStore {
  readonly #file: string;

  constructor(file = dataPath(".mothership", "inbox-read.json")) {
    this.#file = file;
  }

  /**
   * `undefined` when tracking has not started. A damaged file is set aside as
   * `.bak` and tracking starts over; any other failure to read (a permission
   * error, too many open files) is thrown, so it never wipes your marks.
   */
  async #read(): Promise<InboxReadState | undefined> {
    let text: string;
    try {
      text = await readFile(this.#file, "utf8");
    } catch (error) {
      if (isMissingFile(error)) return undefined;
      throw error;
    }
    try {
      return stateSchema.parse(JSON.parse(text));
    } catch (error) {
      console.warn(`[inbox] ${this.#file} is damaged; keeping it as .bak and starting read tracking over:`, error);
      await rename(this.#file, `${this.#file}.bak`).catch((renameError: unknown) => {
        // Another load set it aside first.
        if (!isMissingFile(renameError)) throw renameError;
      });
      return undefined;
    }
  }

  /**
   * ### state
   *
   * The first time, starts read tracking with everything in `keys` marked
   * read, so turning it on does not leave the whole Inbox unread; only what
   * arrives after that starts unread.
   *
   * @param keys - Read keys of the items in the Inbox now.
   */
  async state(keys: Array<string>, now: number): Promise<InboxReadState> {
    const existing = await this.#read();
    if (existing !== undefined) return existing;
    return writeQueueFor(this.#file)(async () => {
      // Another load may have started it while this one waited.
      const started = await this.#read();
      if (started !== undefined) return started;
      const state: InboxReadState = { since: now, marks: Object.fromEntries(keys.map((key) => [key, { read: true, at: now }])) };
      await writeFileAtomic(this.#file, toJsonFile(state));
      return state;
    });
  }

  /**
   * ### mark
   *
   * Marks items read or unread.
   *
   * @param keys - Read keys from the Inbox's items.
   */
  async mark(keys: Array<string>, read: boolean, now: number): Promise<void> {
    await writeQueueFor(this.#file)(async () => {
      const current = (await this.#read()) ?? { since: now, marks: {} };
      const marks = pruneMarks(current.marks, now);
      for (const key of keys) marks[key] = { read, at: now };
      await writeFileAtomic(this.#file, toJsonFile({ since: current.since, marks }));
    });
  }
}
