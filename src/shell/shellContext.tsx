"use client";

import { createContext, useContext, useSyncExternalStore } from "react";
import type { AgentMessage } from "@/features/sessions/model/Agent";
import type { LiveAgents, MessageStore } from "@/features/sessions/model/LiveAgents";
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
 * Streamed messages are left out (see {@link useLiveMessages}), so a new
 * message re-renders only the screens that show messages.
 */
export type Shell = Omit<LiveAgents, "messages"> & {
  /**
   * ### openNewAgent
   *
   * Opens the new-agent dialog; after creation the new session (or
   * comparison) opens in a tab.
   *
   * @param onCreated - Called with the new session's agent id once it is
   *   created (not for a comparison, which starts several), e.g. to link it to a to-do.
   */
  openNewAgent: (draft?: NewAgentDraft, onCreated?: (agentId: string) => void) => void;
  /**
   * ### openPalette
   *
   * Opens the command center: `everything` (quick open), `commands`, or `search` (all tools).
   */
  openPalette: (mode: PaletteMode, query?: string) => void;
  /** Browser notification state and its toggle. */
  notifications: { state: NotificationState; toggle: () => void };
  /** Developer mode is on (Settings → Advanced): feedback and the debug panel are available. */
  developerMode: boolean;
  /** Starts feedback on the screen (developer mode). */
  openFeedback: () => void;
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

/**
 * ### LiveMessagesContext
 *
 * Every agent's messages as they stream in; provided by the workbench's `AppShell` next to {@link ShellContext}.
 */
export const LiveMessagesContext = createContext<MessageStore | undefined>(undefined);

/**
 * ### useLiveMessages
 *
 * @returns Every agent's messages, kept current; a component using it re-renders on each new message.
 */
export function useLiveMessages(): Array<AgentMessage> {
  const store = useContext(LiveMessagesContext);
  if (store === undefined) throw new Error("useLiveMessages must be used inside AppShell");
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
