"use client";

import { useEffect, useMemo, useRef } from "react";
import { openPathIn } from "@/features/explorer/ui/openPath";
import { openAgentFolderIn } from "@/features/sessions/ui/openAgentFolderIn";
import { useCommands, type Command } from "@/shell/commands/commandContext";
import { shiftSection, sideOf, type SectionPlace } from "@/shell/sections";
import { isSectionId, type SectionId } from "@/shell/tabs";
import { newTodoTab } from "@/shell/todos";
import { useWorkbench, type WorkbenchContextValue } from "@/shell/workbenchContext";
import { useT } from "@/ui/i18n/useT";

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
function shiftSectionIn(workbench: WorkbenchContextValue, section: SectionId | undefined, delta: -1 | 1) {
  if (section === undefined) return false;
  const next = shiftSection(workbench.sidebars, section, delta);
  if (next === workbench.sidebars) return false;
  workbench.setSidebars(next);
  focusSectionHeader(section);
}

/** Moves `section` to the end of a sidebar, or out of both; `false` when it is already there. */
function moveSectionTo(workbench: WorkbenchContextValue, section: SectionId | undefined, place: SectionPlace) {
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
  const t = useT();
  const commands = useMemo<Array<Command>>(
    () => [
      { id: "toggle-left", title: t("command.toggleLeft"), group: "View", keys: ["mod+b"], run: () => latest.current.toggleLeft() },
      { id: "toggle-right", title: t("command.toggleRight"), group: "View", keys: ["mod+alt+b"], run: () => latest.current.toggleRight() },
      {
        id: "close-tab",
        title: t("command.closeTab"),
        group: "View",
        keys: ["alt+w"],
        run: () => {
          const key = latest.current.active?.key;
          if (key !== undefined) latest.current.close(key);
        },
      },
      { id: "next-tab", title: t("command.nextTab"), group: "View", keys: ["alt+]"], run: () => latest.current.cycle(1) },
      { id: "prev-tab", title: t("command.prevTab"), group: "View", keys: ["alt+["], run: () => latest.current.cycle(-1) },
      { id: "show-sessions", title: t("command.showSessions"), group: "View", keys: ["g s"], run: () => latest.current.revealSection("sessions") },
      {
        id: "open-explorer",
        title: t("command.explorer"),
        group: "View",
        keys: ["g e"],
        featured: true,
        run: () => latest.current.open({ kind: "section", section: "files" }),
      },
      {
        id: "open-terminal",
        title: t("command.terminal"),
        group: "View",
        keys: ["g t"],
        featured: true,
        // In the folder of what you're looking at: the session's worktree, the file's folder, else the workspace.
        run: () => {
          const tab = latest.current.active?.tab;
          if (tab?.kind === "session" || tab?.kind === "changes") openAgentFolderIn(tab.agentId, "terminal", t);
          else if (tab?.kind === "file") openPathIn(tab.root, tab.path, "terminal", t);
          else openPathIn("workspace", "", "terminal", t);
        },
      },
      { id: "show-todos", title: t("command.showTodo"), group: "View", keys: [], run: () => latest.current.revealSection("todos") },
      { id: "open-daily", title: t("command.daily"), group: "Todo", keys: ["g d"], featured: true, run: () => latest.current.open({ kind: "daily" }) },
      { id: "new-todo", title: t("command.newTodo"), group: "Todo", keys: ["shift+t"], featured: true, run: () => latest.current.open(newTodoTab()) },
      { id: "show-github", title: t("command.showGitHub"), group: "View", keys: ["g g"], run: () => latest.current.revealSection("github") },
      // Not in the default sidebars (few use Notion), so this is how to find it before adding it in Settings → Workspace → Sidebars.
      { id: "show-notion", title: t("command.showNotion"), group: "View", keys: [], run: () => latest.current.revealSection("notion") },
      {
        id: "open-settings",
        title: t("command.settings"),
        group: "View",
        keys: ["mod+,"],
        featured: true,
        run: () => latest.current.open({ kind: "settings" }),
      },
      { id: "open-insights", title: t("command.insights"), group: "View", keys: [], run: () => latest.current.open({ kind: "insights" }) },
      {
        id: "open-usage",
        title: t("command.agentLimits"),
        group: "View",
        keys: [],
        run: () => latest.current.open({ kind: "agent-limits" }),
      },
      {
        id: "open-system",
        title: t("command.system"),
        group: "View",
        keys: [],
        run: () => latest.current.open({ kind: "system" }),
      },
      // Keyboard counterparts of dragging a section's header; they act on the focused section.
      {
        id: "move-section-up",
        title: t("command.sectionUp"),
        group: "Sidebars",
        keys: ["alt+shift+up"],
        run: () => shiftSectionIn(latest.current, targetSection(lastSection.current), -1),
      },
      {
        id: "move-section-down",
        title: t("command.sectionDown"),
        group: "Sidebars",
        keys: ["alt+shift+down"],
        run: () => shiftSectionIn(latest.current, targetSection(lastSection.current), 1),
      },
      {
        id: "move-section-left",
        title: t("command.sectionLeft"),
        group: "Sidebars",
        keys: ["alt+shift+left"],
        run: () => moveSectionTo(latest.current, targetSection(lastSection.current), "left"),
      },
      {
        id: "move-section-right",
        title: t("command.sectionRight"),
        group: "Sidebars",
        keys: ["alt+shift+right"],
        run: () => moveSectionTo(latest.current, targetSection(lastSection.current), "right"),
      },
      {
        id: "hide-section",
        title: t("command.sectionHide"),
        group: "Sidebars",
        keys: [],
        run: () => moveSectionTo(latest.current, targetSection(lastSection.current), "hidden"),
      },
    ],
    [t],
  );
  useCommands(commands);
}
