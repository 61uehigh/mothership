import { BookOpen, Bot, FolderOpen } from "lucide-react";
import type { ComponentType } from "react";
import { DockerIcon, GitHubIcon, GoogleCalendarIcon, LinearIcon, SlackIcon, type BrandIconProps } from "@/ui/brandIcons";
import { SECTIONS, type SectionId } from "@/shell/tabs";

/**
 * ### SECTION_INFO
 *
 * Each section's name and icon. The icon is the app's own mark where there
 * is one; sections that are not an app use the closest line icon.
 */
export const SECTION_INFO: Record<SectionId, { icon: ComponentType<BrandIconProps>; label: string }> = {
  sessions: { icon: Bot, label: "Sessions" },
  files: { icon: FolderOpen, label: "Explorer" },
  github: { icon: GitHubIcon, label: "GitHub" },
  docker: { icon: DockerIcon, label: "Docker" },
  nuclino: { icon: BookOpen, label: "Nuclino" },
  linear: { icon: LinearIcon, label: "Linear" },
  slack: { icon: SlackIcon, label: "Slack" },
  calendar: { icon: GoogleCalendarIcon, label: "Calendar" },
};

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
export const DEFAULT_SIDEBARS: Sidebars = { left: ["sessions", "github", "docker"], right: ["calendar", "slack", "linear", "nuclino"] };

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

/**
 * ### sideOf
 *
 * @returns The sidebar `section` is in, or `undefined` when it is not shown.
 */
export function sideOf(sidebars: Sidebars, section: SectionId): "left" | "right" | undefined {
  return sidebars.left.includes(section) ? "left" : sidebars.right.includes(section) ? "right" : undefined;
}
