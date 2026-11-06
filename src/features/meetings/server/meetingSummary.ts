import { meetingSummarySchema, type MeetingSummary } from "@/features/meetings/model/Meetings";
import { askClaudeJson } from "@/platform/askClaude";

/** Characters of a note sent to Claude at most. */
const NOTE_MAX_CHARS = 60_000;
const SUMMARY_TIMEOUT_MS = 120_000;

function prompt(title: string, markdown: string, today: string): string {
  return [
    `Today is ${today}. Below is a meeting note titled "${title}". Summarize it for someone who did not attend.`,
    "Write in the same language as the note. Keep each entry to one short line and use the note's own names for people and things.",
    "- gist: one or two sentences on what the meeting was about.",
    "- done: things reported as resolved or finished.",
    "- decisions: what was decided. Put the date it was decided or takes effect in `date` (YYYY-MM-DD when you can tell) if the note says.",
    "- actions: follow-ups someone has to do. Put who in `owner` and by when in `due` if the note says.",
    "- open: questions raised but not settled, or things left for later.",
    "Only include what the note says; leave a list empty rather than guess.",
    'Answer with JSON only, no prose: {"gist":"…","done":["…"],"decisions":[{"what":"…","date":"…"}],"actions":[{"what":"…","owner":"…","due":"…"}],"open":["…"]}',
    "",
    "---",
    markdown.slice(0, NOTE_MAX_CHARS),
  ].join("\n");
}

/**
 * ### summarizeMeeting
 *
 * Asks Claude (Sonnet, no tools) for what was done, decided, left to do, and
 * left open in one meeting note.
 *
 * @param today - Your local date, `YYYY-MM-DD`, so relative dates in the note make sense.
 * @throws Error When Claude cannot be reached or does not answer in the expected shape.
 */
export function summarizeMeeting(note: { title: string; markdown: string }, today: string): Promise<MeetingSummary> {
  return askClaudeJson(prompt(note.title, note.markdown, today), meetingSummarySchema, { what: "Claude's summary", model: "sonnet", timeoutMs: SUMMARY_TIMEOUT_MS });
}
