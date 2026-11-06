import { z } from "zod";

/**
 * ### meetingCollectionSchema
 *
 * A Nuclino collection you chose for meeting notes (Settings → Meetings).
 * The title and workspace are kept so the list reads well before Nuclino answers.
 */
export const meetingCollectionSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  workspace: z.string(),
});

/**
 * ### MeetingCollection
 *
 * See {@link meetingCollectionSchema}.
 */
export type MeetingCollection = z.infer<typeof meetingCollectionSchema>;

/**
 * ### MeetingNote
 *
 * One note in a chosen collection, without its body.
 */
export type MeetingNote = {
  /** Nuclino item UUID. */
  id: string;
  title: string;
  /** The collection it is in. */
  collectionId: string;
  /** Epoch milliseconds it was created. */
  createdAt: number | undefined;
  /** Epoch milliseconds of the last edit. */
  updatedAt: number | undefined;
  /** A summary of this version of the note is saved, so opening it is instant. */
  summarized: boolean;
};

/**
 * ### MeetingsView
 *
 * The chosen collections with their newest notes, as the browser gets them.
 */
export type MeetingsView = {
  collections: Array<MeetingCollection & { notes: Array<MeetingNote>; error: string | undefined }>;
};

/**
 * ### meetingSummarySchema
 *
 * What Claude makes of one meeting note. Every list may be empty.
 */
export const meetingSummarySchema = z.object({
  /** One or two sentences on what the meeting was about. */
  gist: z.string(),
  /** Things reported as resolved or finished. */
  done: z.array(z.string()),
  /** Decisions, with the date they take effect or were made when the note says. */
  decisions: z.array(z.object({ what: z.string(), date: z.string().optional() })),
  /** Follow-up actions, with who and by when when the note says. */
  actions: z.array(z.object({ what: z.string(), owner: z.string().optional(), due: z.string().optional() })),
  /** Questions raised but not settled. */
  open: z.array(z.string()),
});

/**
 * ### MeetingSummary
 *
 * See {@link meetingSummarySchema}.
 */
export type MeetingSummary = z.infer<typeof meetingSummarySchema>;

/**
 * ### MeetingSummaryView
 *
 * A note's summary as `GET /api/meetings/summary` returns it.
 */
export type MeetingSummaryView = {
  id: string;
  title: string;
  url: string;
  updatedAt: number | undefined;
  summary: MeetingSummary;
  /** Epoch milliseconds the summary was made. */
  summarizedAt: number;
};

/**
 * ### NuclinoCollectionChoice
 *
 * A collection offered in Settings → Meetings.
 */
export type NuclinoCollectionChoice = MeetingCollection & {
  /** Parent collections, outermost first, e.g. `["Meetings"]` for `Meetings / Weekly`. */
  path: Array<string>;
};
