"use client";

import { useStoredState } from "@/ui/useStoredState";

const STORAGE_KEY = "mothership.explorer.local";

/**
 * ### ExplorerLocation
 *
 * The folder the Explorer shows. `path` is relative to the home folder;
 * `hidden` shows dot files.
 */
export type ExplorerLocation = { path: string; hidden: boolean };

const HOME: ExplorerLocation = { path: "", hidden: false };

/**
 * ### useExplorerLocation
 *
 * The folder the Explorer shows, shared with anything that wants to open it
 * somewhere (e.g. a session's "Browse"). `path` is relative to the home folder.
 */
export function useExplorerLocation(): [ExplorerLocation, (next: ExplorerLocation | ((current: ExplorerLocation) => ExplorerLocation)) => void] {
  return useStoredState(STORAGE_KEY, HOME, parseExplorerLocation);
}

function parseExplorerLocation(raw: string): ExplorerLocation | undefined {
  try {
    // Written only by this component.
    const saved = JSON.parse(raw) as Partial<ExplorerLocation>;
    return { path: typeof saved.path === "string" ? saved.path : "", hidden: saved.hidden === true };
  } catch {
    return undefined;
  }
}

