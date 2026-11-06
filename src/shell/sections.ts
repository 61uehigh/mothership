import { BookOpen, Bot, FolderOpen, Inbox, ListTodo, NotebookPen, NotebookText } from "lucide-react";
import type { ComponentType } from "react";
import { DockerIcon, GitHubIcon, GmailIcon, GoogleCalendarIcon, KakaoTalkIcon, LinearIcon, SlackIcon, YouTubeMusicIcon, type BrandIconProps } from "@/ui/brandIcons";
import { SECTIONS, type SectionId } from "@/shell/tabs";
import type { Locale, Translate } from "@/ui/i18n/translate";

/**
 * ### SECTION_INFO
 *
 * Each section's icon: the app's own mark where there is one; sections that
 * are not an app use the closest line icon. Names are in the catalogs (see {@link sectionLabel}).
 */
export const SECTION_INFO: Record<SectionId, { icon: ComponentType<BrandIconProps> }> = {
  inbox: { icon: Inbox },
  todos: { icon: ListTodo },
  sessions: { icon: Bot },
  files: { icon: FolderOpen },
  github: { icon: GitHubIcon },
  docker: { icon: DockerIcon },
  nuclino: { icon: BookOpen },
  notion: { icon: NotebookText },
  meetings: { icon: NotebookPen },
  linear: { icon: LinearIcon },
  slack: { icon: SlackIcon },
  calendar: { icon: GoogleCalendarIcon },
  gmail: { icon: GmailIcon },
  youtubemusic: { icon: YouTubeMusicIcon },
  kakaotalk: { icon: KakaoTalkIcon },
};

/**
 * ### sectionLabel
 *
 * A section's name in the chosen language.
 */
export function sectionLabel(t: Translate, section: SectionId): string {
  return t(`section.${section}`);
}

/**
 * ### sectionTitle
 *
 * What a section is called wherever it is named (its header, Settings →
 * Sidebars, a "turned off" message): in English, the widget's title from
 * `config/dashboard.yaml` when it has one; in other languages, the section's
 * translated name, because that title is usually the example config's English
 * rather than text you wrote.
 *
 * @param widgetTitle - The title of the dashboard widget behind the section, if any.
 */
export function sectionTitle(locale: Locale, t: Translate, section: SectionId, widgetTitle: string | undefined): string {
  return locale === "en" && widgetTitle !== undefined ? widgetTitle : sectionLabel(t, section);
}

/**
 * ### Sidebars
 *
 * Which sections each sidebar stacks, top to bottom. A section in neither is
 * not shown in a sidebar (it still opens full size from the command center).
 */
export type Sidebars = { left: Array<SectionId>; right: Array<SectionId> };

/**
 * ### DEFAULT_SIDEBARS
 *
 * Development work on the left, everyday work tools on the right.
 */
export const DEFAULT_SIDEBARS: Sidebars = { left: ["inbox", "todos", "sessions", "github", "docker"], right: ["calendar", "gmail", "slack", "linear", "meetings", "nuclino", "kakaotalk", "youtubemusic"] };

/**
 * ### normalizeSidebars
 *
 * Keeps a saved layout valid as sections come and go: drops unknown ids and
 * repeats (the first place a section appears wins).
 *
 * @param saved - Untrusted: read back from browser storage.
 */
export function normalizeSidebars(saved: unknown): Sidebars {
  if (typeof saved !== "object" || saved === null) return DEFAULT_SIDEBARS;
  const known = new Set<string>(SECTIONS);
  const seen = new Set<string>();
  const side = (value: unknown): Array<SectionId> =>
    Array.isArray(value)
      ? value.filter((id): id is SectionId => typeof id === "string" && known.has(id) && !seen.has(id) && (seen.add(id), true))
      : [];
  const { left, right } = saved as { left?: unknown; right?: unknown };
  return { left: side(left), right: side(right) };
}

/** Sections a layout saved before layouts listed the sections they knew of had seen. */
const SECTIONS_BEFORE_TRACKING: ReadonlyArray<SectionId> = SECTIONS.filter((s) => s !== "todos");

/**
 * ### withNewSections
 *
 * Adds sections that are new since a layout was saved to the sidebar the
 * defaults put them in, after the section they follow there, so a new
 * section shows up without a trip to Settings. Sections you removed stay removed.
 *
 * @param seen - The sections the saved layout knew of; untrusted, from browser storage.
 */
export function withNewSections(sidebars: Sidebars, seen: unknown): Sidebars {
  const known = new Set<unknown>(Array.isArray(seen) ? seen : SECTIONS_BEFORE_TRACKING);
  const next = { left: [...sidebars.left], right: [...sidebars.right] };
  for (const side of ["left", "right"] as const) {
    DEFAULT_SIDEBARS[side].forEach((section, index) => {
      if (known.has(section) || sideOf(next, section) !== undefined) return;
      const after = DEFAULT_SIDEBARS[side][index - 1];
      const at = after === undefined ? -1 : next[side].indexOf(after);
      next[side].splice(at + 1, 0, section);
    });
  }
  return next;
}

/**
 * ### sideOf
 *
 * @returns The sidebar `section` is in, or `undefined` when it is not shown.
 */
export function sideOf(sidebars: Sidebars, section: SectionId): "left" | "right" | undefined {
  return sidebars.left.includes(section) ? "left" : sidebars.right.includes(section) ? "right" : undefined;
}

/**
 * ### SectionPlace
 *
 * Where a section can go: one of the sidebars, or not shown in either.
 */
export type SectionPlace = "left" | "right" | "hidden";

/**
 * ### SECTION_DRAG_TYPE
 *
 * Drag-and-drop data type that carries a section id, shared by the sidebars
 * and Settings → Workspace → Sidebars so a section can be dragged from one to the other.
 */
export const SECTION_DRAG_TYPE = "application/x-mothership-section";

/**
 * ### moveSection
 *
 * Takes `section` out of wherever it is and puts it in `place`, at `index`
 * of that list once the section is out of it (the end when `index` is
 * left out or past the end).
 */
export function moveSection(sidebars: Sidebars, section: SectionId, place: SectionPlace, index?: number): Sidebars {
  const left = sidebars.left.filter((s) => s !== section);
  const right = sidebars.right.filter((s) => s !== section);
  if (place === "hidden") return { left, right };
  const list = place === "left" ? left : right;
  list.splice(index === undefined ? list.length : Math.max(0, Math.min(index, list.length)), 0, section);
  return { left, right };
}

/**
 * ### dropSection
 *
 * Moves `section` to just before the section now at `before` in `place`
 * (the end when it is left out), as a drop between two rows does. Dropping
 * lower in the section's own list counts positions before it moved out.
 */
export function dropSection(sidebars: Sidebars, section: SectionId, place: SectionPlace, before?: number): Sidebars {
  const from = place === "hidden" ? -1 : sidebars[place].indexOf(section);
  const at = before !== undefined && from !== -1 && from < before ? before - 1 : before;
  return moveSection(sidebars, section, place, at);
}

/**
 * ### shiftSection
 *
 * Moves `section` one place up (`-1`) or down (`1`) in its sidebar.
 *
 * @returns The same object when there is nowhere to go (top, bottom, or not shown).
 */
export function shiftSection(sidebars: Sidebars, section: SectionId, delta: -1 | 1): Sidebars {
  const side = sideOf(sidebars, section);
  if (side === undefined) return sidebars;
  const index = sidebars[side].indexOf(section) + delta;
  if (index < 0 || index >= sidebars[side].length) return sidebars;
  return moveSection(sidebars, section, side, index);
}
