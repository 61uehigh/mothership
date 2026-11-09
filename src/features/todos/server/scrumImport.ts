import { KOREAN_HOLIDAYS } from "@/features/todos/model/koreanHolidays";
import { scrumDoneItems, seoulDay, type ScrumDoneItem, type ScrumImportPlan, type ScrumPost } from "@/features/todos/model/ScrumImport";
import type { TodoStore } from "@/features/todos/server/TodoStore";

/**
 * ### ScrumImportResult
 *
 * What an import found and did. In a dry run nothing is written and
 * `added` counts what would be.
 */
export type ScrumImportResult = Omit<ScrumImportPlan, "items"> & {
  dryRun: boolean;
  items: Array<ScrumDoneItem & { alreadyImported: boolean }>;
  added: number;
  skipped: number;
  /** First and last day with a done item. */
  range: { from: string; to: string } | undefined;
};

/**
 * ### ChannelMessage
 *
 * A message as Slack's search reads it; any of its ids can be missing when
 * the search output left them out.
 */
export type ChannelMessage = { ts: string | undefined; at: number | undefined; permalink: string | undefined; markup: string };

/**
 * ### scrumPostsFrom
 *
 * @returns The messages that can be imported: only one with an id, a time,
 *   and a link can be dated and deduplicated.
 */
export function scrumPostsFrom(messages: ReadonlyArray<ChannelMessage>): Array<ScrumPost> {
  return messages.flatMap((m) => (m.ts === undefined || m.permalink === undefined || m.at === undefined ? [] : [{ ts: m.ts, at: m.at, permalink: m.permalink, markup: m.markup }]));
}

/**
 * ### importScrumPosts
 *
 * Reads your Daily Scrum posts and adds what they report as done to the
 * to-do list, checked off on the day it was done (see `scrumDoneItems`).
 * Bullets imported before are skipped.
 *
 * @param posts - Loads your messages in the channel, oldest first.
 */
export async function importScrumPosts(input: { posts: () => Promise<ReadonlyArray<ChannelMessage>>; store: TodoStore; dryRun: boolean; now: number }): Promise<ScrumImportResult> {
  const plan = scrumDoneItems(scrumPostsFrom(await input.posts()), KOREAN_HOLIDAYS, seoulDay(input.now));
  const known = new Set((await input.store.list()).flatMap((t) => (t.source?.kind === "slack-scrum" ? [t.source.key] : [])));
  const items = plan.items.map((item) => ({ ...item, alreadyImported: known.has(item.key) }));
  const range = items.length === 0 ? undefined : { from: items[0]!.day, to: items.at(-1)!.day };
  let added = items.filter((item) => !item.alreadyImported).length;
  let skipped = items.length - added;
  if (!input.dryRun) {
    ({ added, skipped } = await input.store.importDone(
      plan.items.map((item) => ({
        text: item.title,
        body: item.body,
        doneAt: item.doneAt,
        source: { kind: "slack-scrum", url: item.permalink, key: item.key, inferred: item.inferred },
      })),
    ));
  }
  return { ...plan, dryRun: input.dryRun, items, added, skipped, range };
}
