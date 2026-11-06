import { SETTINGS_PAGES, type SettingsPageId } from "@/features/settings/model/Settings";
import { writeStoredState } from "@/ui/useStoredState";

/**
 * ### SETTINGS_PAGE_KEY
 *
 * Where Settings remembers its last destination, including a Workspace section.
 */
export const SETTINGS_PAGE_KEY = "mothership.settings.page";

/**
 * ### SettingsDestination
 *
 * A menu page or a direct entry to a section of Workspace. Plain `workspace` opens Sidebars.
 */
export type SettingsDestination = SettingsPageId | "workspace/inbox" | "workspace/meetings";

const WORKSPACE_DESTINATIONS = ["workspace/inbox", "workspace/meetings"] as const;
const PREVIOUS_DESTINATIONS = new Map<string, SettingsDestination>([
  ["tools", "connections"],
  ["sidebars", "workspace"],
  ["inbox", "workspace/inbox"],
  ["meetings", "workspace/meetings"],
  ["developer", "advanced"],
  ["usage", "agents"],
  ["system", "general"],
]);

/**
 * ### parseSettingsPage
 *
 * Reads the saved destination, including menu IDs from before the regrouping.
 *
 * @returns The destination, or `undefined` if the stored value is unrecognized.
 */
export function parseSettingsPage(raw: string): SettingsDestination | undefined {
  return SETTINGS_PAGES.find((page) => page === raw)
    ?? WORKSPACE_DESTINATIONS.find((destination) => destination === raw)
    ?? PREVIOUS_DESTINATIONS.get(raw);
}

/**
 * ### settingsMenuPage
 *
 * Maps a destination to its parent entry in the Settings menu.
 */
export function settingsMenuPage(destination: SettingsDestination): SettingsPageId {
  if (destination === "workspace/inbox" || destination === "workspace/meetings") return "workspace";
  return destination;
}

/**
 * ### openSettingsPage
 *
 * Selects the destination and opens or focuses the Settings tab.
 */
export function openSettingsPage(destination: SettingsDestination, openSettings: () => void): void {
  writeStoredState(SETTINGS_PAGE_KEY, destination);
  openSettings();
}
