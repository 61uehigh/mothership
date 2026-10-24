"use client";

import { createContext, useContext } from "react";
import type { LiveAgents } from "@/features/sessions/model/LiveAgents";
import type { NewAgentDraft } from "@/features/sessions/model/NewAgentDraft";
import type { NotificationState } from "@/features/notifications/model/NotificationState";

/**
 * ### PaletteMode
 *
 * What the command center opens to: quick open, commands, or a search across tools.
 */
export type PaletteMode = "everything" | "commands" | "search";

/**
 * ### Shell
 *
 * What every feature may ask of the app frame: live agents and app-wide
 * actions. The workbench provides it; features only see this contract.
 */
export type Shell = LiveAgents & {
  /**
   * ### openNewAgent
   *
   * Opens the new-agent dialog; after creation the new session (or
   * comparison) opens in a tab.
   */
  openNewAgent: (draft?: NewAgentDraft) => void;
  /**
   * ### openPalette
   *
   * Opens the command center: `everything` (quick open), `commands`, or `search` (all tools).
   */
  openPalette: (mode: PaletteMode, query?: string) => void;
  /** Opens the keyboard shortcuts dialog. */
  openHelp: () => void;
  /** Browser notification state and its toggle. */
  notifications: { state: NotificationState; toggle: () => void };
};

/**
 * ### ShellContext
 *
 * Provided by the workbench's `AppShell`.
 */
export const ShellContext = createContext<Shell | undefined>(undefined);

/**
 * ### useShell
 *
 * @returns Live agents and app-wide actions.
 */
export function useShell(): Shell {
  const shell = useContext(ShellContext);
  if (shell === undefined) throw new Error("useShell must be used inside AppShell");
  return shell;
}
