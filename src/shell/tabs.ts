import { z } from "zod";

/**
 * ### Tab
 *
 * Something open in the center area. Each kind is rendered by the entry of
 * the same name in `registry.tsx`.
 * - `file.root` is an agent id (its working directory) or `"workspace"`.
 * - `pr.repo` is `owner/name`.
 * - `slack.url` is the message permalink.
 */
export type Tab =
  | { kind: "session"; agentId: string }
  | { kind: "changes"; agentId: string }
  | { kind: "compare"; group: string }
  | { kind: "graph" }
  | { kind: "inbox"; questionId?: string }
  | { kind: "file"; root: string; path: string }
  | { kind: "pr"; repo: string; number: number }
  | { kind: "doc"; itemId: string; title: string }
  | { kind: "issue"; issueId: string; title: string }
  | { kind: "slack"; url: string; title: string }
  | { kind: "event"; eventId: string; title: string }
  | { kind: "calendar" }
  | { kind: "settings" }
  | { kind: "section"; section: SectionId }
  | { kind: "container"; id: string; name: string };

/**
 * ### TabKind
 *
 * The `kind` of a {@link Tab}.
 */
export type TabKind = Tab["kind"];

/**
 * ### tabKey
 *
 * Opening a tab whose key is already open focuses it instead of adding a
 * second copy.
 *
 * @returns A stable identity for the tab's target.
 */
export function tabKey(tab: Tab): string {
  switch (tab.kind) {
    case "graph":
    case "calendar":
    case "settings":
      return tab.kind;
    case "inbox":
      return "inbox";
    case "session":
    case "changes":
      return `${tab.kind}:${tab.agentId}`;
    case "compare":
      return `compare:${tab.group}`;
    case "file":
      return `file:${tab.root}:${tab.path}`;
    case "pr":
      return `pr:${tab.repo}#${tab.number}`;
    case "doc":
      return `doc:${tab.itemId}`;
    case "issue":
      return `issue:${tab.issueId}`;
    case "slack":
      return `slack:${tab.url}`;
    case "event":
      return `event:${tab.eventId}`;
    case "section":
      return `section:${tab.section}`;
    case "container":
      return `container:${tab.id}`;
  }
}


/**
 * ### SECTIONS
 *
 * Every section; each can be stacked in a sidebar (see `Sidebars`) and opened
 * full size as a `section` tab.
 */
export const SECTIONS = ["sessions", "files", "github", "docker", "nuclino", "linear", "slack", "calendar"] as const;

/**
 * ### SectionId
 *
 * One of {@link SECTIONS}.
 */
export type SectionId = (typeof SECTIONS)[number];

/**
 * ### LEFT_SECTIONS
 *
 * Sections stacked in the left sidebar: development work.
 */
export const LEFT_SECTIONS: Array<SectionId> = ["sessions", "github", "docker"];

/**
 * ### RIGHT_SECTIONS
 *
 * Sections stacked in the right sidebar: everyday work tools.
 */
export const RIGHT_SECTIONS: Array<SectionId> = ["calendar", "slack", "linear", "nuclino"];

/**
 * ### COLLAPSED_BY_DEFAULT
 *
 * Sections that start folded, to leave room for the rest.
 */
export const COLLAPSED_BY_DEFAULT: Array<SectionId> = ["docker", "nuclino"];

const text = z.string().min(1);

/** Every tab kind with the fields it needs; a saved tab must match one exactly to be restored. */
const tabSchema: z.ZodType<Tab> = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("session"), agentId: text }),
  z.object({ kind: z.literal("changes"), agentId: text }),
  z.object({ kind: z.literal("compare"), group: text }),
  z.object({ kind: z.literal("graph") }),
  z.object({ kind: z.literal("inbox"), questionId: text.optional() }),
  z.object({ kind: z.literal("file"), root: text, path: z.string() }),
  z.object({ kind: z.literal("pr"), repo: z.string().regex(/^[^/\s]+\/[^/\s]+$/), number: z.number().int().positive() }),
  z.object({ kind: z.literal("doc"), itemId: text, title: z.string() }),
  z.object({ kind: z.literal("issue"), issueId: text, title: z.string() }),
  z.object({ kind: z.literal("slack"), url: text, title: z.string() }),
  z.object({ kind: z.literal("event"), eventId: text, title: z.string() }),
  z.object({ kind: z.literal("calendar") }),
  z.object({ kind: z.literal("settings") }),
  z.object({ kind: z.literal("section"), section: z.enum(SECTIONS) }),
  z.object({ kind: z.literal("container"), id: text, name: z.string() }),
]);

/**
 * ### parseTab
 *
 * Checks a tab restored from storage: a kind this version can draw, with
 * every field it needs. Anything else (a removed kind or section, a stale
 * shape) is dropped, so one bad entry can never break the whole layout.
 *
 * @returns The tab, or `undefined` to drop it.
 */
export function parseTab(value: unknown): Tab | undefined {
  const parsed = tabSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
