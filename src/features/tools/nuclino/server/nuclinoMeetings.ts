import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { MeetingCollection, MeetingNote, NuclinoCollectionChoice } from "@/features/meetings/model/Meetings";
import { toGfm } from "@/features/tools/nuclino/server/nuclinoDoc";
import { isoToEpoch, parseJson, truncate } from "@/features/tools/server/sourceUtils";
import { isRateLimited, ToolRateLimitError } from "@/platform/mcp/RateLimitGate";
import type { ToolCaller } from "@/platform/mcp/ToolCaller";
import { writeFileAtomic, writeQueueFor } from "@/platform/files";
import { processState } from "@/platform/processState";

/** Item reads are reused this long, so browsing collections does not refetch every note. */
const ITEM_CACHE_MS = 5 * 60_000;
/** A collection's list of notes is reused this long, unless you refresh. */
const COLLECTION_CACHE_MS = 30 * 60_000;
/**
 * Notes in a listing are reused this long, even on refresh, plus up to
 * {@link LISTED_NOTE_SPREAD_MS} so they do not all expire together (all 200
 * or so at once is what tripped Nuclino's rate limit). A note's title and
 * date change seldom, and when they do they are picked up without reading
 * it: from the Recent docs list and search ({@link noteListedItems}) and
 * when you open it.
 */
const LISTED_NOTE_CACHE_MS = 7 * 24 * 60 * 60_000;
const LISTED_NOTE_SPREAD_MS = 24 * 60 * 60_000;
/** Opening a note reads its summary and its body; within this, both use one read. */
const OPENED_NOTE_CACHE_MS = 30_000;
/** Notes read per collection at most. Nuclino keeps children in sidebar order, so both ends are read. */
const NOTES_PER_COLLECTION = 40;
/** Item reads in flight at once. */
const CONCURRENCY = 2;
/** How long to wait when a rate limit does not say when it ends. */
const DEFAULT_PAUSE_MS = 30_000;

// Shape of `get_item` output (checked against real calls): collections carry `childIds`.
const itemSchema = z.object({
  type: z.string(),
  id: z.string(),
  workspaceId: z.string().optional(),
  title: z.string(),
  content: z.string().nullish(),
  createdAt: z.string().nullish(),
  lastUpdatedAt: z.string().nullish(),
  childIds: z.array(z.string()).optional(),
});
const workspaceSchema = z.array(z.object({ id: z.string(), name: z.string(), childIds: z.array(z.string()).default([]) }));
const savedSchema = z.record(z.string(), z.object({ at: z.number(), item: itemSchema }));

type Item = z.infer<typeof itemSchema>;

/** `withContent`: the item was read in this run; one restored from disk has no body. */
const itemCache = processState("nuclino.items", () => new Map<string, { at: number; item: Item; withContent: boolean }>());
/** `unsaved`: {@link itemCache} has items {@link saveNuclinoItems} has not written yet. `restored`: the one read of the saved items. */
const cacheFile = processState("nuclino.itemsFile", () => ({ unsaved: false, restored: undefined as Promise<void> | undefined }));

/**
 * ### restoreNuclinoItems
 *
 * Fills the item cache from `file` (once per run), so after a restart the
 * meeting list comes from what was read before instead of reading every
 * note again. Items read since are kept.
 */
export function restoreNuclinoItems(file: string): Promise<void> {
  cacheFile.restored ??= (async () => {
    const text = await readFile(file, "utf8").catch(() => undefined);
    if (text === undefined) return;
    const parsed = savedSchema.safeParse(parseJson(text));
    // A damaged file only costs a fresh read.
    if (!parsed.success) return;
    for (const [id, { at, item }] of Object.entries(parsed.data)) {
      if (!itemCache.has(id)) itemCache.set(id, { at, item, withContent: false });
    }
  })();
  return cacheFile.restored;
}

/**
 * ### saveNuclinoItems
 *
 * Writes the cached items to `file` when there are new ones: titles, dates,
 * and children, not note bodies.
 */
export async function saveNuclinoItems(file: string): Promise<void> {
  await writeQueueFor(file)(async () => {
    if (!cacheFile.unsaved) return;
    cacheFile.unsaved = false;
    const entries = Object.fromEntries([...itemCache].map(([id, { at, item }]) => [id, { at, item: { ...item, content: undefined } }]));
    try {
      await writeFileAtomic(file, `${JSON.stringify(entries)}\n`);
    } catch (error) {
      // Left to save next time; items read meanwhile have set the flag already.
      cacheFile.unsaved = true;
      throw error;
    }
  });
}

/**
 * ### readNuclinoItem
 *
 * One item, from the cache when it is younger than `maxAgeMs`. While Nuclino
 * is rate limiting, an older cached copy is used instead. (The caller holds
 * back calls during the pause, so those cost no request.)
 *
 * @param options - `maxAgeMs`: `0` reads fresh. `needContent`: only a copy
 *   with the note's body will do. `onLimited`: told when Nuclino is rate
 *   limiting, with when it may answer again, also when the cache answered.
 * @throws Error When the call fails (a rate limit too, when the item is not
 *   cached) or the output is not the expected JSON.
 */
export async function readNuclinoItem(
  caller: ToolCaller,
  itemId: string,
  { maxAgeMs = ITEM_CACHE_MS, needContent = false, onLimited }: { maxAgeMs?: number; needContent?: boolean; onLimited?: (retryAt: number) => void } = {},
): Promise<Item> {
  const found = itemCache.get(itemId);
  const cached = found !== undefined && (found.withContent || !needContent) ? found : undefined;
  if (cached !== undefined && Date.now() - cached.at < maxAgeMs) return cached.item;
  let text: string;
  try {
    text = await caller.callText("get_item", { itemId });
  } catch (error) {
    if (!isRateLimited(error)) throw error;
    onLimited?.(error instanceof ToolRateLimitError ? error.retryAt : Date.now() + DEFAULT_PAUSE_MS);
    if (cached !== undefined) return cached.item;
    throw error;
  }
  const parsed = itemSchema.safeParse(parseJson(text));
  if (!parsed.success) throw new Error(`Could not parse the Nuclino response: ${truncate(text, 200)}`);
  itemCache.set(itemId, { at: Date.now(), item: parsed.data, withContent: true });
  cacheFile.unsaved = true;
  return parsed.data;
}

/** A fixed share of {@link LISTED_NOTE_SPREAD_MS} for one note, so each note expires at its own time. */
function listedNoteAge(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return LISTED_NOTE_CACHE_MS + (hash % 1000) * (LISTED_NOTE_SPREAD_MS / 1000);
}

/**
 * ### noteListedItems
 *
 * Takes in what another Nuclino listing (Recent docs, search) says about
 * items: a cached note whose `lastUpdatedAt` differs gets the new title and
 * date, and its body is read again the next time it is needed. That keeps
 * the meeting list current without reading the notes themselves.
 */
export function noteListedItems(items: ReadonlyArray<{ id: string; title: string; lastUpdatedAt?: string | null }>): void {
  for (const listed of items) {
    const cached = itemCache.get(listed.id);
    if (cached === undefined || listed.lastUpdatedAt == null || cached.item.lastUpdatedAt === listed.lastUpdatedAt) continue;
    itemCache.set(listed.id, { at: cached.at, item: { ...cached.item, title: listed.title, lastUpdatedAt: listed.lastUpdatedAt, content: undefined }, withContent: false });
    cacheFile.unsaved = true;
  }
}

/** Runs `run` over `inputs`, at most {@link CONCURRENCY} at a time, keeping order. */
async function mapLimited<T, R>(inputs: Array<T>, run: (input: T) => Promise<R>): Promise<Array<R>> {
  const out: Array<R> = new Array(inputs.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, inputs.length) }, async () => {
      while (next < inputs.length) {
        const index = next++;
        out[index] = await run(inputs[index]);
      }
    }),
  );
  return out;
}

/**
 * ### listNuclinoCollections
 *
 * The collections directly under a workspace or a collection, for choosing
 * meeting collections one level at a time.
 *
 * @param parentId - A workspace or collection id; `undefined` lists the workspaces themselves.
 * @param path - Names of `parentId` and its parents, outermost first, to carry into the choices.
 */
export async function listNuclinoCollections(caller: ToolCaller, parentId: string | undefined, path: Array<string>): Promise<Array<NuclinoCollectionChoice & { kind: "workspace" | "collection" }>> {
  const parsed = workspaceSchema.safeParse(parseJson(await caller.callText("list_workspaces", { limit: 100 })));
  if (!parsed.success) throw new Error("Could not parse the Nuclino workspace list");
  const workspaces = parsed.data;
  if (parentId === undefined) return workspaces.map((w) => ({ kind: "workspace", id: w.id, title: w.name, workspace: w.name, path: [] }));
  const workspace = workspaces.find((w) => w.id === parentId);
  const childIds = workspace?.childIds ?? (await readNuclinoItem(caller, parentId)).childIds ?? [];
  const children = await mapLimited(childIds, (id) => readNuclinoItem(caller, id).catch(() => undefined));
  return children.flatMap((child) =>
    child?.type === "collection"
      ? [{ kind: "collection" as const, id: child.id, title: child.title || "(untitled)", workspace: workspaces.find((w) => w.id === child.workspaceId)?.name ?? "", path }]
      : [],
  );
}

/**
 * ### MeetingNoteListing
 *
 * What {@link listMeetingNotes} found.
 */
export type MeetingNoteListing = {
  notes: Array<Omit<MeetingNote, "summarized">>;
  /** Set when Nuclino was rate limiting: some notes or the collection came from the cache, or are missing; epoch milliseconds when it may answer again. */
  limitedUntil?: number;
};

/**
 * ### listMeetingNotes
 *
 * The newest notes in a collection, including those in collections inside
 * it (a "Weekly" collection with one collection per year, say). Reads at
 * most {@link NOTES_PER_COLLECTION} notes, and only those it has not read
 * in the last week or so. While Nuclino is rate limiting it lists what it
 * read before rather than failing.
 *
 * @param fresh - Read the collection's list of notes again (the refresh button).
 * @returns Notes newest first, by when they were created.
 */
export async function listMeetingNotes(
  caller: ToolCaller,
  collection: MeetingCollection,
  fresh: boolean,
): Promise<MeetingNoteListing> {
  let limitedUntil: number | undefined;
  const onLimited = (retryAt: number) => {
    limitedUntil = Math.max(limitedUntil ?? 0, retryAt);
  };
  /** Reads one item; while rate limited, one not read before is left out. */
  const read = (id: string, maxAgeMs: number): Promise<Item | undefined> =>
    readNuclinoItem(caller, id, { maxAgeMs, onLimited }).catch((error: unknown) => {
      if (isRateLimited(error)) return undefined;
      throw error;
    });
  const collectionAge = fresh ? 0 : COLLECTION_CACHE_MS;
  const notes: Array<Item> = [];
  const top = await read(collection.id, collectionAge);
  let level = top === undefined ? [] : [top];
  while (level.length > 0 && notes.length < NOTES_PER_COLLECTION) {
    const ids = level.flatMap((c) => c.childIds ?? []);
    const room = NOTES_PER_COLLECTION - notes.length;
    // Sidebar order may put new notes first or last; keep both ends.
    const picked = ids.length <= room ? ids : [...ids.slice(0, Math.ceil(room / 2)), ...ids.slice(ids.length - Math.floor(room / 2))];
    // Collections are read as fresh as the listing, so new notes show; notes come from the longer cache.
    const children = (
      await mapLimited(picked, (id) => {
        const known = itemCache.get(id)?.item;
        // Any other failure (a deleted note, say) leaves just that one out.
        return read(id, known?.type === "item" ? listedNoteAge(id) : collectionAge).catch(() => undefined);
      })
    ).filter((c) => c !== undefined);
    notes.push(...children.filter((c) => c.type === "item"));
    level = children.filter((c) => c.type === "collection");
  }
  const listed = notes
    .map((note) => ({
      id: note.id,
      title: note.title || "(untitled)",
      collectionId: collection.id,
      createdAt: isoToEpoch(note.createdAt ?? undefined),
      updatedAt: isoToEpoch(note.lastUpdatedAt ?? undefined),
    }))
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  return limitedUntil === undefined ? { notes: listed } : { notes: listed, limitedUntil };
}

/**
 * ### readMeetingNote
 *
 * A note's body as Markdown, read fresh (or in the last 30 seconds) so the
 * summary matches its latest version, or the cached copy while Nuclino is
 * rate limiting.
 */
export async function readMeetingNote(caller: ToolCaller, itemId: string): Promise<{ title: string; markdown: string; updatedAt: number | undefined }> {
  const item = await readNuclinoItem(caller, itemId, { maxAgeMs: OPENED_NOTE_CACHE_MS, needContent: true });
  if (item.type !== "item") throw new Error(`"${item.title}" is a collection, not a note`);
  return { title: item.title || "(untitled)", markdown: toGfm(item.content ?? ""), updatedAt: isoToEpoch(item.lastUpdatedAt ?? undefined) };
}
