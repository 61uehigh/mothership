"use client";

import { useEffect, useMemo, useRef } from "react";
import { openPathIn } from "@/features/explorer/ui/openPath";
import { openIn } from "@/features/sessions/ui/openIn";
import { useCommands, type Command } from "@/shell/commands/CommandProvider";
import { shiftSection, sideOf, type SectionPlace } from "@/shell/sections";
import { openSettingsPage } from "@/shell/settingsPage";
import { isSectionId, type SectionId } from "@/shell/tabs";
import { newTodoTab } from "@/shell/todos";
import { useWorkbench, type Workbench } from "@/shell/WorkbenchContext";

/** The sidebar section holding `element`, if it is in one. */
function sectionOf(element: Element | null): SectionId | undefined {
  const id = element?.closest("[data-section]")?.getAttribute("data-section");
  return isSectionId(id) ? id : undefined;
}

/** Puts focus back on a section's header after it moved, so the keys can move it again. */
function focusSectionHeader(section: SectionId) {
  requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-section="${section}"] [data-section-handle]`)?.focus());
}

/**
 * The section a section command acts on: the one focus is in, or, from the
 * command palette, `last`, the one focus was last in. While typing in a
 * section (a reply box, say) the keys belong to the text field.
 */
function targetSection(last: SectionId | undefined): SectionId | undefined {
  const element = document.activeElement;
  if (!(element instanceof HTMLElement)) return undefined;
  if (element.closest(':modal, [aria-modal="true"]') !== null) return last;
  if (element.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName)) return undefined;
  return sectionOf(element);
}

/** Moves `section` one place up or down in its sidebar; `false` when it can't go further. */
function shiftSectionIn(workbench: Workbench, section: SectionId | undefined, delta: -1 | 1) {
  if (section === undefined) return false;
  const next = shiftSection(workbench.sidebars, section, delta);
  if (next === workbench.sidebars) return false;
  workbench.setSidebars(next);
  focusSectionHeader(section);
}

/** Moves `section` to the end of a sidebar, or out of both; `false` when it is already there. */
function moveSectionTo(workbench: Workbench, section: SectionId | undefined, place: SectionPlace) {
  if (section === undefined || (sideOf(workbench.sidebars, section) ?? "hidden") === place) return false;
  workbench.placeSection(section, place);
  if (place !== "hidden") focusSectionHeader(section);
}

/**
 * ### useWorkbenchCommands
 *
 * Registers the frame's commands: sidebars, tabs, the sections to show, and
 * the keyboard counterparts of dragging a section.
 */
export function useWorkbenchCommands(): void {
  const workbench = useWorkbench();
  // Commands read the latest workbench through this ref so they register once.
  const latest = useRef(workbench);
  useEffect(() => {
    latest.current = workbench;
  });

  // The section focus was last in, for the section commands run from the command palette.
  const lastSection = useRef<SectionId | undefined>(undefined);
  useEffect(() => {
    const onFocusIn = (event: FocusEvent) => {
      const section = sectionOf(event.target instanceof Element ? event.target : null);
      if (section !== undefined) lastSection.current = section;
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, []);
  const commands = useMemo<Array<Command>>(
    () => [
      { id: "toggle-left", title: "Toggle left sidebar", group: "View", keys: ["mod+b"], run: () => latest.current.toggleLeft() },
      { id: "toggle-right", title: "Toggle right sidebar", group: "View", keys: ["mod+alt+b"], run: () => latest.current.toggleRight() },
      {
        id: "close-tab",
        title: "Close tab",
        group: "View",
        keys: ["alt+w"],
        run: () => {
          const key = latest.current.active?.key;
          if (key !== undefined) latest.current.close(key);
        },
      },
      { id: "next-tab", title: "Next tab", group: "View", keys: ["alt+]"], run: () => latest.current.cycle(1) },
      { id: "prev-tab", title: "Previous tab", group: "View", keys: ["alt+["], run: () => latest.current.cycle(-1) },
      { id: "show-sessions", title: "Show sessions", group: "View", keys: ["g s"], run: () => latest.current.revealSection("sessions") },
      {
        id: "open-explorer",
        title: "Open Explorer",
        group: "View",
        keys: ["g e"],
        featured: true,
        run: () => latest.current.open({ kind: "section", section: "files" }),
      },
      {
        id: "open-terminal",
        title: "Open Terminal",
        group: "View",
        keys: ["g t"],
        featured: true,
        // In the folder of what you're looking at: the session's worktree, the file's folder, else the workspace.
        run: () => {
          const tab = latest.current.active?.tab;
          if (tab?.kind === "session" || tab?.kind === "changes") openIn(tab.agentId, "terminal");
          else if (tab?.kind === "file") openPathIn(tab.root, tab.path, "terminal");
          else openPathIn("workspace", "", "terminal");
        },
      },
      { id: "show-todos", title: "Show Todo", group: "View", keys: [], run: () => latest.current.revealSection("todos") },
      { id: "new-todo", title: "New to-do (title and notes)", group: "Todo", keys: ["shift+t"], featured: true, run: () => latest.current.open(newTodoTab()) },
      { id: "show-github", title: "Show GitHub", group: "View", keys: ["g g"], run: () => latest.current.revealSection("github") },
      // Not in the default sidebars (few use Notion), so this is how to find it before adding it in Settings → Sidebars.
      { id: "show-notion", title: "Show Notion", group: "View", keys: [], run: () => latest.current.revealSection("notion") },
      {
        id: "open-settings",
        title: "Open Settings",
        group: "View",
        keys: ["mod+,"],
        featured: true,
        run: () => latest.current.open({ kind: "settings" }),
      },
      { id: "open-insights", title: "Open Insights", group: "View", keys: [], run: () => latest.current.open({ kind: "insights" }) },
      {
        id: "open-usage",
        title: "Open usage",
        group: "View",
        keys: [],
        // Settings → Usage: Claude and Codex limits, the status bar's left side in detail.
        run: () => openSettingsPage("usage", () => latest.current.open({ kind: "settings" })),
      },
      {
        id: "open-system",
        title: "Open system",
        group: "View",
        keys: [],
        // Settings → This Mac: CPU, memory, disk, and battery, the status bar's right side in detail.
        run: () => openSettingsPage("system", () => latest.current.open({ kind: "settings" })),
      },
      // Keyboard counterparts of dragging a section's header; they act on the focused section.
      {
        id: "move-section-up",
        title: "Move section up",
        group: "Sidebars",
        keys: ["alt+shift+up"],
        run: () => shiftSectionIn(latest.current, targetSection(lastSection.current), -1),
      },
      {
        id: "move-section-down",
        title: "Move section down",
        group: "Sidebars",
        keys: ["alt+shift+down"],
        run: () => shiftSectionIn(latest.current, targetSection(lastSection.current), 1),
      },
      {
        id: "move-section-left",
        title: "Move section to the left sidebar",
        group: "Sidebars",
        keys: ["alt+shift+left"],
        run: () => moveSectionTo(latest.current, targetSection(lastSection.current), "left"),
      },
      {
        id: "move-section-right",
        title: "Move section to the right sidebar",
        group: "Sidebars",
        keys: ["alt+shift+right"],
        run: () => moveSectionTo(latest.current, targetSection(lastSection.current), "right"),
      },
      {
        id: "hide-section",
        title: "Hide section from the sidebar",
        group: "Sidebars",
        keys: [],
        run: () => moveSectionTo(latest.current, targetSection(lastSection.current), "hidden"),
      },
    ],
    [],
  );
  useCommands(commands);
}
