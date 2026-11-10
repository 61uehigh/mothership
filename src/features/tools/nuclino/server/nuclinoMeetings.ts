import { z } from "zod";
import type { MeetingCollection, MeetingNote, NuclinoCollectionChoice } from "@/features/meetings/model/Meetings";
import { toGfm } from "@/features/tools/nuclino/server/nuclinoDoc";
import { isoToEpoch, parseJson, truncate } from "@/features/tools/server/sourceUtils";
import { isRateLimited } from "@/platform/mcp/RateLimitGate";
import type { ToolCaller } from "@/platform/mcp/ToolCaller";

/** Item reads are reused this long, so browsing collections does not refetch every note. */
const ITEM_CACHE_MS = 5 * 60_000;
/**
 * Notes in a listing are reused this long, even on refresh: a note's title
 * and date rarely change, and reading 40 notes again soon hits Nuclino's rate
 * limit. Opening a note always reads it fresh.
 */
const LISTED_NOTE_CACHE_MS = 60 * 60_000;
/** Notes read per collection at most. Nuclino keeps children in sidebar order, so both ends are read. */
const NOTES_PER_COLLECTION = 40;
/** Item reads in flight at once. */
const CONCURRENCY = 4;

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

type Item = z.infer<typeof itemSchema>;

const itemCache = new Map<string, { at: number; item: Item }>();

/**
 * ### readNuclinoItem
 *
 * One item, from the cache when it is younger than `maxAgeMs`. While Nuclino
 * is rate limiting, an older cached copy is used instead. (The caller holds
 * back calls during the pause, so those cost no request.)
 *
 * @param maxAgeMs - `0` reads fresh.
 * @throws Error When the call fails (a rate limit too, when the item is not
 *   cached) or the output is not the expected JSON.
 */
export async function readNuclinoItem(caller: ToolCaller, itemId: string, maxAgeMs = ITEM_CACHE_MS): Promise<Item> {
  const cached = itemCache.get(itemId);
  if (cached !== undefined && Date.now() - cached.at < maxAgeMs) return cached.item;
  let text: string;
  try {
    text = await caller.callText("get_item", { itemId });
  } catch (error) {
    if (cached !== undefined && isRateLimited(error)) return cached.item;
    throw error;
  }
  const parsed = itemSchema.safeParse(parseJson(text));
  if (!parsed.success) throw new Error(`Could not parse the Nuclino response: ${truncate(text, 200)}`);
  itemCache.set(itemId, { at: Date.now(), item: parsed.data });
  return parsed.data;
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
 * ### listMeetingNotes
 *
 * The newest notes in a collection, including those in collections inside
 * it (a "Weekly" collection with one collection per year, say). Reads at
 * most {@link NOTES_PER_COLLECTION} notes.
 *
 * @param summarized - Whether a summary of a note's version is saved.
 * @returns Notes newest first, by when they were created.
 */
export async function listMeetingNotes(
  caller: ToolCaller,
  collection: MeetingCollection,
  summarized: (id: string, updatedAt: number | undefined) => boolean,
  fresh: boolean,
): Promise<Array<MeetingNote>> {
  const notes: Array<Item> = [];
  const collectionAge = fresh ? 0 : ITEM_CACHE_MS;
  let level = [await readNuclinoItem(caller, collection.id, collectionAge)];
  while (level.length > 0 && notes.length < NOTES_PER_COLLECTION) {
    const ids = level.flatMap((c) => c.childIds ?? []);
    const room = NOTES_PER_COLLECTION - notes.length;
    // Sidebar order may put new notes first or last; keep both ends.
    const picked = ids.length <= room ? ids : [...ids.slice(0, Math.ceil(room / 2)), ...ids.slice(ids.length - Math.floor(room / 2))];
    // Collections are read as fresh as the listing, so new notes show; notes come from the longer cache.
    const children = (
      await mapLimited(picked, async (id) => {
        const known = itemCache.get(id)?.item;
        return readNuclinoItem(caller, id, known?.type === "item" ? LISTED_NOTE_CACHE_MS : collectionAge).catch((error: unknown) => {
          // A partial list would look complete; say Nuclino is limiting instead.
          if (isRateLimited(error)) throw error;
          return undefined;
        });
      })
    ).filter((c) => c !== undefined);
    notes.push(...children.filter((c) => c.type === "item"));
    level = children.filter((c) => c.type === "collection");
  }
  return notes
    .map((note): MeetingNote => {
      const updatedAt = isoToEpoch(note.lastUpdatedAt ?? undefined);
      return {
        id: note.id,
        title: note.title || "(untitled)",
        collectionId: collection.id,
        createdAt: isoToEpoch(note.createdAt ?? undefined),
        updatedAt,
        summarized: summarized(note.id, updatedAt),
      };
    })
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

/**
 * ### readMeetingNote
 *
 * A note's body as Markdown, read fresh so the summary matches its latest
 * version, or the cached copy while Nuclino is rate limiting.
 */
export async function readMeetingNote(caller: ToolCaller, itemId: string): Promise<{ title: string; markdown: string; updatedAt: number | undefined }> {
  const item = await readNuclinoItem(caller, itemId, 0);
  if (item.type !== "item") throw new Error(`"${item.title}" is a collection, not a note`);
  return { title: item.title || "(untitled)", markdown: toGfm(item.content ?? ""), updatedAt: isoToEpoch(item.lastUpdatedAt ?? undefined) };
}
