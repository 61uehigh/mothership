import type {
  MeetingCollection,
  MeetingNote,
  MeetingsView,
  MeetingSummary,
  MeetingSummaryView,
  NuclinoCollectionChoice,
} from "@/features/meetings/model/Meetings";
import { summarizeMeeting } from "@/features/meetings/server/meetingSummary";
import type { NuclinoDoc } from "@/features/tools/model/Tools";
import { HttpError } from "@/platform/http/HttpError";
import { SingleFlight } from "@/platform/SingleFlight";
import { SummaryStore } from "@/platform/SummaryStore";
import { errorMessage } from "@/lib/errors";

/**
 * ### MeetingNotesSource
 *
 * Where meeting notes are read from (Nuclino). Each call throws an
 * `HttpError` when the tool is not set up, rate limiting, or failing.
 */
export type MeetingNotesSource = {
  /** The newest notes in `collection`; `limitedUntil` is set when some came from the cache because of a rate limit. */
  listNotes: (collection: MeetingCollection, fresh: boolean) => Promise<{ notes: Array<Omit<MeetingNote, "summarized">>; limitedUntil?: number }>;
  readNote: (id: string) => Promise<{ title: string; markdown: string; updatedAt: number | undefined }>;
  /** Collections to choose from, one level at a time; `parentId` `undefined` lists the workspaces. */
  listCollections: (parentId: string | undefined, path: Array<string>) => Promise<Array<NuclinoCollectionChoice & { kind: "workspace" | "collection" }>>;
  noteUrl: (id: string) => string;
  /** Loads the notes read before a restart, so they are not read again. */
  restoreCache: () => Promise<void>;
  saveCache: () => Promise<void>;
};

/**
 * ### MeetingsDependencies
 *
 * @property collections - The collections you chose in Settings → Meetings.
 * @property today - Today in the dashboard's time zone, `YYYY-MM-DD`, so Claude can date the follow-ups.
 */
export type MeetingsDependencies = {
  source: MeetingNotesSource;
  collections: () => Promise<Array<MeetingCollection>>;
  today: () => Promise<string>;
};

/** A note's version is its last edit; a summary is made once per version. */
const versionOf = (updatedAt: number | undefined) => String(updatedAt ?? 0);

function sameCollections(view: MeetingsView, chosen: Array<MeetingCollection>): boolean {
  return view.collections.map((c) => c.id).join("\n") === chosen.map((c) => c.id).join("\n");
}

/** The last list is answered as it is for this long; after that it is still answered at once, and read again in the background. */
const LIST_FRESH_MS = 10 * 60_000;

/**
 * ### MeetingsService
 *
 * The Meetings section: the newest notes in your collections and Claude's
 * summary of each, saved per version of the note. Holds the summaries in
 * progress, so it lives on the shared server state.
 */
export class MeetingsService {
  readonly #deps: MeetingsDependencies;
  readonly #summaries = new SummaryStore<MeetingSummary>("meeting-summaries");
  readonly #summarizing = new SingleFlight<string, MeetingSummaryView>();
  readonly #listing = new SingleFlight<"list", MeetingsView>();
  #last: { view: MeetingsView; at: number } | undefined;

  constructor(deps: MeetingsDependencies) {
    this.#deps = deps;
  }

  /**
   * ### list
   *
   * Reads one collection after another: reading them all at once is what
   * trips Nuclino's rate limit. A collection that fails says why; the others
   * still show. A second request while one runs (another window, a retry)
   * shares it. Without `refresh`, the last list is answered at once and,
   * once it is ten minutes old, read again in the background for next time,
   * so opening Meetings never waits on Nuclino.
   *
   * @param refresh - Read the collections fresh, so new notes show; notes already read come from the cache.
   */
  async list(refresh: boolean): Promise<MeetingsView> {
    const last = this.#last;
    // A list cut short by a rate limit is read again when asked: that is the retry.
    if (refresh || last === undefined || last.view.rateLimitedUntil !== undefined) return this.#listing.run("list", () => this.#read(refresh));
    // Collections chosen in Settings since the last read must show now, not after the next background read.
    if (!sameCollections(last.view, await this.#deps.collections())) return this.#listing.run("list", () => this.#read(false));
    if (Date.now() - last.at >= LIST_FRESH_MS) {
      void this.#listing.run("list", () => this.#read(false)).catch((error: unknown) => console.warn("[meetings] Could not read the list in the background:", error));
    }
    // A summary made since the list was read shows its mark.
    return this.#marked(last.view);
  }

  async #marked(view: MeetingsView): Promise<MeetingsView> {
    const collections = await Promise.all(
      view.collections.map(async (c) => ({
        ...c,
        notes: await Promise.all(c.notes.map(async (note) => ({ ...note, summarized: await this.#summaries.has(note.id, versionOf(note.updatedAt)) }))),
      })),
    );
    return { ...view, collections };
  }

  async #read(refresh: boolean): Promise<MeetingsView> {
    const { source } = this.#deps;
    const chosen = await this.#deps.collections();
    await source.restoreCache();
    const collections: MeetingsView["collections"] = [];
    let rateLimitedUntil: number | undefined;
    try {
      for (const collection of chosen) {
        try {
          const listing = await source.listNotes(collection, refresh);
          if (listing.limitedUntil !== undefined) rateLimitedUntil = Math.max(rateLimitedUntil ?? 0, listing.limitedUntil);
          const notes = await Promise.all(
            listing.notes.map(async (note) => ({ ...note, summarized: await this.#summaries.has(note.id, versionOf(note.updatedAt)) })),
          );
          collections.push({ ...collection, notes, error: undefined });
        } catch (error) {
          collections.push({ ...collection, notes: [], error: { code: error instanceof HttpError ? error.code : undefined, params: error instanceof HttpError ? error.params : undefined, message: errorMessage(error) } });
        }
      }
    } finally {
      await source.saveCache().catch((error: unknown) => console.warn("[meetings] Could not save the Nuclino cache:", error));
    }
    const view = rateLimitedUntil === undefined ? { collections } : { collections, rateLimitedUntil };
    this.#last = { view, at: Date.now() };
    return view;
  }

  /**
   * ### collectionChoices
   *
   * @param parentId - A workspace or collection id; `undefined` lists the workspaces.
   */
  collectionChoices(parentId: string | undefined, path: Array<string>): Promise<Array<NuclinoCollectionChoice & { kind: "workspace" | "collection" }>> {
    return this.#deps.source.listCollections(parentId, path);
  }

  /**
   * ### note
   *
   * The note itself, for the full note under its summary. Read the same way
   * as for the summary, so while Nuclino is rate limiting it is the copy the
   * summary was made from rather than a failure.
   *
   * @throws HttpError When the source fails (429 while rate limited and the note is not cached).
   */
  async note(itemId: string): Promise<NuclinoDoc> {
    const note = await this.#deps.source.readNote(itemId);
    return { id: itemId, title: note.title, markdown: note.markdown, url: this.#deps.source.noteUrl(itemId), updatedAt: note.updatedAt };
  }

  /**
   * ### summary
   *
   * The saved summary when the note has not changed since, otherwise a new
   * one (which takes a while). A second request for the same note waits for
   * the first, unless only the second asks for a fresh summary.
   *
   * @param fresh - Make a new summary even if one is saved.
   * @throws HttpError 422 for an empty note, or when the source fails; Error when Claude does.
   */
  summary(itemId: string, fresh: boolean): Promise<MeetingSummaryView> {
    return this.#summarizing.run(`${itemId}:${fresh}`, async () => {
      const note = await this.#deps.source.readNote(itemId);
      const version = versionOf(note.updatedAt);
      const base = { id: itemId, title: note.title, url: this.#deps.source.noteUrl(itemId), updatedAt: note.updatedAt };
      const saved = fresh ? undefined : await this.#summaries.get(itemId, version);
      if (saved !== undefined) return { ...base, summary: saved.value, summarizedAt: saved.at };
      if (note.markdown.trim() === "") throw new HttpError("This note is empty, so there is nothing to summarize.", 422, "note-empty");
      const summary = await summarizeMeeting(note, await this.#deps.today());
      return { ...base, summary, summarizedAt: await this.#summaries.set(itemId, version, summary) };
    });
  }
}
