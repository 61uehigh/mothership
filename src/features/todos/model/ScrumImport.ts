import { z } from "zod";
import { addDays, zonedDate } from "@/lib/dates";
import { HOLIDAY_YEARS } from "@/features/todos/model/koreanHolidays";

/*
 * Turns your Daily Scrum posts in Slack into to-dos checked off on the day
 * you did them, for the history the Daily tab shows. A post reads
 *
 *   어제 한 일
 *   • Safety
 *       ◦ DEV-2175 웹훅 본문의 Content-Length …
 *   오늘 할 일
 *   • …
 *
 * and "어제" means the last workday before the post: weekends and public
 * holidays are skipped, so Monday's post is about Friday and the post after
 * 추석 is about the day before it began. Every leaf bullet under "어제 한 일" becomes one
 * done to-do; the bullets above it (a product, a release) are kept in its notes.
 */

const SEOUL = "Asia/Seoul";
const TITLE_MAX = 60;
/** The hour, Seoul time, imported to-dos are checked off at: the work happened that day, the hour is not known. */
const DONE_HOUR = "18:00:00+09:00";


/**
 * ### ScrumPost
 *
 * One of your messages in the scrum channel, as Slack search returns it.
 */
export type ScrumPost = {
  ts: string;
  /** Epoch milliseconds it was posted. */
  at: number;
  permalink: string;
  /** Slack mrkdwn with its line breaks. */
  markup: string;
};

/**
 * ### ScrumBullet
 *
 * A leaf bullet: one thing done or planned.
 */
export type ScrumBullet = {
  /** The bullets it sits under, outermost first, as plain text. */
  path: Array<string>;
  /** Plain text, links as their labels. */
  text: string;
  /** Markdown, links kept. */
  markdown: string;
};

/**
 * ### ParsedScrumPost
 *
 * A post's two sections. `daysBack` is 2 when it reports "그저께" (the day
 * before yesterday) instead of "어제".
 */
export type ParsedScrumPost = { done: Array<ScrumBullet>; plan: Array<ScrumBullet>; daysBack: 1 | 2 };

const DONE_HEADING = /^\s*\*?\s*(어제|그저께|그제|지난\s*근무일)\s*(에\s*)?한\s*일|^\s*\*?\s*yesterday\b/i;
const PLAN_HEADING = /^\s*\*?\s*오늘\s*(에\s*)?할\s*일|^\s*\*?\s*today\b/i;
const BULLET = /^(\s*)(?:[•◦▪▫‣⁃●○■□–*-]︎?|\d+[.)])\s+(.*)$/;

function unescape(text: string): string {
  return text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

/** `<url|label>` → label (plain) or `[label](url)` (Markdown); `<@U1|name>` → `@name`. */
function slackText(markup: string, markdown: boolean): string {
  const out = markup
    .replace(/<@\w+\|([^>]+)>/g, "@$1")
    .replace(/<#\w+\|([^>]+)>/g, "#$1")
    .replace(/<(https?:[^|>]+)\|([^>]+)>/g, (_, url: string, label: string) => (markdown ? `[${label.trim()}](${url})` : label.trim()))
    .replace(/<(https?:[^>]+)>/g, (_, url: string) => (markdown ? `<${url}>` : url));
  return unescape(out).replace(/\s+/g, " ").trim();
}

type Node = { level: number; markup: string; children: Array<Node> };

/** Leaf bullets under `nodes`, each with the text of the bullets above it. */
function leaves(nodes: Array<Node>, path: Array<string>): Array<ScrumBullet> {
  return nodes.flatMap((node) => {
    const text = slackText(node.markup, false);
    if (node.children.length > 0) return leaves(node.children, [...path, text]);
    return text === "" ? [] : [{ path, text, markdown: slackText(node.markup, true) }];
  });
}

/** Bullet lines as a tree: Slack indents each level by four spaces. */
function bulletTree(lines: Array<string>): Array<Node> {
  const roots: Array<Node> = [];
  const stack: Array<Node> = [];
  for (const raw of lines) {
    const match = BULLET.exec(raw);
    if (match === null) {
      // A line without a bullet continues the bullet above it.
      const last = stack.at(-1);
      if (last !== undefined && raw.trim() !== "") last.markup += ` ${raw.trim()}`;
      continue;
    }
    const node: Node = { level: Math.round(match[1]!.replace(/\t/g, "    ").length / 4), markup: match[2]!, children: [] };
    while (stack.length > 0 && stack.at(-1)!.level >= node.level) stack.pop();
    (stack.at(-1)?.children ?? roots).push(node);
    stack.push(node);
  }
  return roots;
}

/**
 * ### parseScrumPost
 *
 * @returns The post's "어제 한 일" and "오늘 할 일" leaf bullets, or
 *   `undefined` when it has no "어제 한 일" section (a thread reply, a note).
 */
export function parseScrumPost(markup: string): ParsedScrumPost | undefined {
  const sections: Record<"done" | "plan", Array<string>> = { done: [], plan: [] };
  let current: "done" | "plan" | undefined;
  let daysBack: 1 | 2 = 1;
  let sawDone = false;
  for (const line of markup.split("\n")) {
    if (DONE_HEADING.test(line)) {
      current = "done";
      sawDone = true;
      daysBack = /그저께|그제/.test(line) ? 2 : 1;
    } else if (PLAN_HEADING.test(line)) current = "plan";
    else if (current !== undefined) sections[current].push(line);
  }
  if (!sawDone) return undefined;
  return { done: leaves(bulletTree(sections.done), []), plan: leaves(bulletTree(sections.plan), []), daysBack };
}

/**
 * ### seoulDay
 *
 * @returns The date in Seoul of `epochMs`, `YYYY-MM-DD`.
 */
export function seoulDay(epochMs: number): string {
  return zonedDate(epochMs, SEOUL);
}

function isWorkday(day: string, holidays: ReadonlySet<string>): boolean {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  return weekday !== 0 && weekday !== 6 && !holidays.has(day);
}

/**
 * ### workdayBefore
 *
 * @returns The workday `count` workdays before `day`, skipping weekends and `holidays`.
 */
export function workdayBefore(day: string, count: number, holidays: ReadonlySet<string>): string {
  let found = day;
  for (let left = count; left > 0; ) {
    found = addDays(found, -1);
    if (isWorkday(found, holidays)) left--;
  }
  return found;
}

/**
 * ### isThreadReply
 *
 * A reply's permalink names the thread it is in, which is another message.
 */
export function isThreadReply(post: Pick<ScrumPost, "ts" | "permalink">): boolean {
  const thread = /[?&]thread_ts=([\d.]+)/.exec(post.permalink)?.[1];
  return thread !== undefined && thread !== post.ts;
}

const STOP_WORDS = new Set(["to", "w/", "from", "by", "at", "및", "등", "-", "·", "&", "|", "(진행중)"]);
const TRACKER_ID = /\b(?:[A-Z]{2,10}-\d+|#\d+)\b/g;

function words(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[\s,:()[\]]+/)
      .filter((word) => word !== "" && !STOP_WORDS.has(word)),
  );
}

/**
 * ### sameWork
 *
 * Whether two bullets are about the same work: they name the same issue or
 * PR, or at least half the words of the shorter one are in the other.
 */
export function sameWork(a: string, b: string): boolean {
  const ids = new Set(a.match(TRACKER_ID) ?? []);
  if ((b.match(TRACKER_ID) ?? []).some((id) => ids.has(id))) return true;
  const left = words(a);
  const right = words(b);
  const smaller = left.size <= right.size ? left : right;
  const larger = smaller === left ? right : left;
  if (smaller.size === 0) return false;
  const shared = [...smaller].filter((word) => larger.has(word)).length;
  return shared / smaller.size >= 0.5;
}

/**
 * ### ScrumDoneItem
 *
 * One to-do to import: done on `day`.
 */
export type ScrumDoneItem = {
  /** Permalink (without its query) and bullet number: the same bullet always gets the same key. */
  key: string;
  day: string;
  /** Epoch milliseconds: 18:00 in Seoul on `day`. */
  doneAt: number;
  title: string;
  body: string;
  permalink: string;
  /** Not reported; guessed from that day's plan (see {@link scrumDoneItems}). */
  inferred: boolean;
};

/**
 * ### ScrumImportPlan
 *
 * What an import would add, and the days it could not account for.
 */
export type ScrumImportPlan = {
  items: Array<ScrumDoneItem>;
  /** Posts read (thread replies and posts without "어제 한 일" are not counted). */
  posts: number;
  notes: Array<{ day: string; note: string }>;
};

function title(text: string): string {
  return text.length <= TITLE_MAX ? text : `${text.slice(0, TITLE_MAX - 1).trimEnd()}…`;
}

function body(bullet: ScrumBullet, extra: string | undefined): string {
  const lines = [...(bullet.path.length > 0 ? [bullet.path.join(" › ")] : []), bullet.markdown];
  return extra === undefined ? lines.join("\n") : `${lines.join("\n")}\n\n${extra}`;
}

const doneAt = (day: string) => Date.parse(`${day}T${DONE_HOUR}`);
const permalinkBase = (permalink: string) => permalink.replace(/\?.*$/, "");

/**
 * ### scrumDoneItems
 *
 * The done to-dos your scrum posts describe. Each post's "어제 한 일" is
 * dated to the workday before it (two for "그저께"), skipping weekends and
 * `holidays`, so Monday's post is about Friday.
 *
 * The last workday before a weekend or holiday that nobody reported (a
 * Monday without a post leaves Friday unreported) is inferred from the plan
 * you posted that day: what you planned and the next post neither reports as
 * done nor plans again is taken as done that day. What the next post does
 * mention is left out, since it was finished, or still going, later. Inferred
 * to-dos say so in their notes. Workdays with neither a report nor a plan are
 * listed in `notes`.
 *
 * @param today - Seoul today; today's own plan is not inferred yet.
 */
export function scrumDoneItems(posts: Array<ScrumPost>, holidays: ReadonlySet<string>, today: string): ScrumImportPlan {
  const parsed = posts
    .filter((post) => !isThreadReply(post))
    .map((post) => ({ post, day: seoulDay(post.at), content: parseScrumPost(post.markup) }))
    .flatMap((entry) => (entry.content === undefined ? [] : [{ ...entry, content: entry.content }]))
    .sort((a, b) => a.post.at - b.post.at);

  const items: Array<ScrumDoneItem> = [];
  const notes: ScrumImportPlan["notes"] = [];
  const reported = new Set<string>();
  for (const { post, day, content } of parsed) {
    const doneDay = workdayBefore(day, content.daysBack, holidays);
    reported.add(doneDay);
    if (content.daysBack === 2) notes.push({ day: doneDay, note: `The ${day} post reports the day before yesterday ("그저께"), so it is dated ${doneDay}.` });
    content.done.forEach((bullet, index) =>
      items.push({ key: `${permalinkBase(post.permalink)}#${index}`, day: doneDay, doneAt: doneAt(doneDay), title: title(bullet.text), body: body(bullet, undefined), permalink: post.permalink, inferred: false }),
    );
  }

  parsed.forEach(({ post, day, content }, index) => {
    if (reported.has(day) || !isWorkday(day, holidays) || day >= today) return;
    const next = parsed[index + 1];
    if (next === undefined) {
      notes.push({ day, note: `Not reported yet: no post after ${day}.` });
      return;
    }
    if (content.plan.length === 0) {
      notes.push({ day, note: `No post reported ${day}, and that day's post planned nothing to go on.` });
      return;
    }
    // Only the last workday before a weekend or holiday: the next post then comes
    // after the break and says what came next. A gap mid-week (a post skipped on
    // Tuesday) leaves too much unsaid, and plans that span weeks would be guessed done.
    if (isWorkday(addDays(day, 1), holidays)) {
      notes.push({ day, note: `No post reported ${day} (${content.plan.length} things were planned); not inferred, since only a day before a weekend or holiday is.` });
      return;
    }
    const later = [...next.content.done, ...next.content.plan];
    const kept = content.plan.filter((bullet) => !later.some((other) => sameWork(bullet.text, other.text)));
    const why = `Inferred: planned on ${day}; there was no post about that day, and the next post (${next.day}) neither reports this nor plans it again.`;
    kept.forEach((bullet, bulletIndex) =>
      items.push({
        key: `${permalinkBase(post.permalink)}#plan-${bulletIndex}`,
        day,
        doneAt: doneAt(day),
        title: title(bullet.text),
        body: body(bullet, why),
        permalink: post.permalink,
        inferred: true,
      }),
    );
    const left = content.plan.length - kept.length;
    notes.push({
      day,
      note: `No post reported ${day}; inferred ${kept.length} of the ${content.plan.length} things planned that day${left > 0 ? ` (${left} came up again on ${next.day}, so they are left to that day)` : ""}.`,
    });
  });

  // Workdays between the first and last report with neither a report nor a post of their own.
  const days = parsed.map((entry) => entry.day);
  const posted = new Set(days);
  if (parsed.length > 0) {
    for (let day = workdayBefore(days[0]!, 1, holidays); day < days.at(-1)!; day = addDays(day, 1)) {
      if (isWorkday(day, holidays) && !reported.has(day) && !posted.has(day)) notes.push({ day, note: "Nothing to go on: no post that day and none reporting it." });
    }
  }

  // Long silences: more than one workday without a post may be days off nobody can know about.
  parsed.forEach((entry, index) => {
    const next = parsed[index + 1];
    if (next === undefined) return;
    const missing: Array<string> = [];
    for (let day = addDays(entry.day, 1); day < next.day; day = addDays(day, 1)) if (isWorkday(day, holidays)) missing.push(day);
    if (missing.length > 1) notes.push({ day: missing[0]!, note: `${missing.length} workdays without a post (${missing.join(", ")}): days off, or posts skipped?` });
  });
  const years = new Set(parsed.map((entry) => entry.day.slice(0, 4)));
  for (const year of years) if (!HOLIDAY_YEARS.has(year)) notes.push({ day: `${year}-01-01`, note: `No holiday list for ${year}: its posts are dated skipping weekends only.` });

  return { items: items.sort((a, b) => a.doneAt - b.doneAt || a.key.localeCompare(b.key)), posts: parsed.length, notes: notes.sort((a, b) => a.day.localeCompare(b.day)) };
}

/**
 * ### scrumImportSchema
 *
 * Body of `POST /api/todos/import/slack-scrum`: the channel to read your
 * posts in, whether to only show what would be added, and, when Settings
 * does not have your Slack member id right, whose posts to read.
 */
export const scrumImportSchema = z.object({
  channel: z.string().regex(/^[CG][A-Z0-9]+$/, { error: "channel must be a Slack channel id like C05AQUQPBBQ" }),
  dryRun: z.boolean().default(true),
  /** Whose posts: a Slack member id; else your id from Settings → You. */
  userId: z.string().regex(/^[UW][A-Z0-9]+$/, { error: "userId must be a Slack member id like U0123ABCD" }).optional(),
});
