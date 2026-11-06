import { readFile, rename } from "node:fs/promises";
import { z } from "zod";
import { writeQueueFor, toJsonFile, writeFileAtomic } from "@/platform/files";
import { dataPath } from "@/platform/paths";
import { isMissingFile } from "@/lib/errors";

/** Entries kept per file; the least recently made go first. */
const MAX_ENTRIES = 500;

type Entry<T> = { version: string; at: number; value: T };

const fileSchema = z.record(z.string(), z.object({ version: z.string(), at: z.number(), value: z.unknown() }));

/**
 * ### SummaryStore
 *
 * Summaries saved in `.mothership/<name>.json`, each for one version of its
 * source (a note's last edit, a PR's head commit), so a summary is made once
 * per version.
 */
export class SummaryStore<T> {
  readonly #file: string;
  /** The entries, read once and shared by concurrent first calls; cleared when the read fails. */
  #entries: Promise<Map<string, Entry<T>>> | undefined;

  /**
   * @param name - File name without `.json`, e.g. `meeting-summaries`.
   * @param file - Where the file is; by default `.mothership/<name>.json` in the data folder.
   */
  constructor(name: string, file = dataPath(".mothership", `${name}.json`)) {
    this.#file = file;
  }

  /**
   * Only a missing file is empty. A damaged file is set aside as `.bak` and
   * starts over; any other failure to read (a permission error, too many open
   * files) is thrown and nothing is cached, so the next call tries again and a
   * save never overwrites summaries it could not read.
   */
  #load(): Promise<Map<string, Entry<T>>> {
    this.#entries ??= this.#read().catch((error: unknown) => {
      this.#entries = undefined;
      throw error;
    });
    return this.#entries;
  }

  async #read(): Promise<Map<string, Entry<T>>> {
    let text: string;
    try {
      text = await readFile(this.#file, "utf8");
    } catch (error) {
      if (isMissingFile(error)) return new Map();
      throw error;
    }
    try {
      // Trusted for `value`: only `set` writes it, with a `T`.
      return new Map(Object.entries(fileSchema.parse(JSON.parse(text)) as Record<string, Entry<T>>));
    } catch (error) {
      console.warn(`[summaries] ${this.#file} is damaged; keeping it as .bak and starting over:`, error);
      await rename(this.#file, `${this.#file}.bak`).catch((renameError: unknown) => {
        // Another load set it aside first.
        if (!isMissingFile(renameError)) throw renameError;
      });
      return new Map();
    }
  }

  /**
   * ### get
   *
   * @returns The saved summary of that version, or `undefined`.
   */
  async get(id: string, version: string): Promise<{ value: T; at: number } | undefined> {
    const entry = (await this.#load()).get(id);
    return entry?.version === version ? { value: entry.value, at: entry.at } : undefined;
  }

  /**
   * ### has
   *
   * @returns Whether a summary of that version is saved.
   */
  async has(id: string, version: string): Promise<boolean> {
    return (await this.#load()).get(id)?.version === version;
  }

  /**
   * ### set
   *
   * Saves the summary of a version, replacing any older one.
   */
  async set(id: string, version: string, value: T): Promise<number> {
    const entries = await this.#load();
    const at = Date.now();
    entries.delete(id);
    entries.set(id, { version, at, value });
    while (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value as string);
    const json = toJsonFile(Object.fromEntries(entries));
    await writeQueueFor(this.#file)(() => writeFileAtomic(this.#file, json));
    return at;
  }
}
