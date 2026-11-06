import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { dataPath } from "@/platform/paths";

/** Entries kept per file; the least recently made go first. */
const MAX_ENTRIES = 500;

type Entry<T> = { version: string; at: number; value: T };

/**
 * ### SummaryStore
 *
 * Summaries saved in `.mothership/<name>.json`, each for one version of its
 * source (a note's last edit, a PR's head commit), so a summary is made once
 * per version.
 */
export class SummaryStore<T> {
  readonly #file: string;
  #entries: Map<string, Entry<T>> | undefined;
  #writing: Promise<void> = Promise.resolve();

  /** @param name - File name without `.json`, e.g. `meeting-summaries`. */
  constructor(name: string) {
    this.#file = dataPath(".mothership", `${name}.json`);
  }

  async #load(): Promise<Map<string, Entry<T>>> {
    if (this.#entries === undefined) {
      try {
        this.#entries = new Map(Object.entries(JSON.parse(await readFile(this.#file, "utf8")) as Record<string, Entry<T>>));
      } catch {
        this.#entries = new Map();
      }
    }
    return this.#entries;
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
    const json = `${JSON.stringify(Object.fromEntries(entries), null, 2)}\n`;
    this.#writing = this.#writing.then(async () => {
      await mkdir(path.dirname(this.#file), { recursive: true });
      await writeFile(`${this.#file}.tmp`, json);
      await rename(`${this.#file}.tmp`, this.#file);
    });
    await this.#writing;
    return at;
  }
}
