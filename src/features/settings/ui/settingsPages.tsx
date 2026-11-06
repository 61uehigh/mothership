import { Bot, PanelsLeftRight, Plug, SlidersHorizontal, User, Wrench, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { connectionsNeedAttention, SETTINGS_PAGES, type SettingsPageId, type SettingsView } from "@/features/settings/model/Settings";
import { AdvancedPage } from "@/features/settings/ui/pages/AdvancedPage";
import { AgentsPage } from "@/features/settings/ui/pages/AgentsPage";
import { ConnectionsPage } from "@/features/settings/ui/pages/ConnectionsPage";
import { GeneralPage } from "@/features/settings/ui/pages/GeneralPage";
import { ProfilePage } from "@/features/settings/ui/pages/ProfilePage";
import { WorkspacePage } from "@/features/settings/ui/pages/WorkspacePage";
import type { SettingsDestination } from "@/shell/settingsPage";

/**
 * ### SettingsPageContext
 *
 * State and actions shared by Settings pages.
 */
export type SettingsPageContext = {
  /** The latest settings and setup checks. */
  view: SettingsView;
  /** Saves a change and returns an error message, if any. */
  send: (url: string, method: string, body: unknown) => Promise<string | undefined>;
  /** Saves the value for one integration or agent. */
  saveSecret: (name: string, value: string) => Promise<string | undefined>;
  /** Refreshes setup checks. */
  recheck: () => Promise<void>;
  /** The selected page or Workspace section. */
  destination: SettingsDestination;
  /** Chooses a destination within Settings. */
  showPage: (destination: SettingsDestination) => void;
};

/**
 * ### SettingsPage
 *
 * An entry in the main Settings menu.
 */
export type SettingsPage = {
  /** Stable page ID, independent of the display name. */
  id: SettingsPageId;
  /** Visible and accessible name. */
  label: string;
  /** Icon shown next to the name. */
  icon: LucideIcon;
  /** Whether a setup issue on this page should mark the menu entry. */
  needsAttention: (view: SettingsView) => boolean;
  /** The page body. */
  render: (context: SettingsPageContext) => ReactNode;
};

const never = () => false;

const PAGES: Record<SettingsPageId, Omit<SettingsPage, "id">> = {
  general: { label: "General", icon: SlidersHorizontal, needsAttention: never, render: () => <GeneralPage /> },
  profile: { label: "Profile", icon: User, needsAttention: never, render: (context) => <ProfilePage {...context} /> },
  agents: {
    label: "Agents",
    icon: Bot,
    needsAttention: (view) => !Object.values(view.agents).some((check) => check.ready),
    render: (context) => <AgentsPage {...context} />,
  },
  connections: {
    label: "Connections",
    icon: Plug,
    needsAttention: (view) => connectionsNeedAttention(view) || !view.tools.github.ready || !view.tools.docker.ready,
    render: (context) => <ConnectionsPage {...context} />,
  },
  workspace: { label: "Workspace", icon: PanelsLeftRight, needsAttention: never, render: (context) => <WorkspacePage {...context} /> },
  advanced: {
    label: "Advanced",
    icon: Wrench,
    needsAttention: (view) => view.developer.enabled && view.developer.sourceFolder === undefined,
    render: (context) => <AdvancedPage {...context} />,
  },
};

/**
 * ### SETTINGS_PAGE_LIST
 *
 * Settings pages in navigation order.
 */
export const SETTINGS_PAGE_LIST: ReadonlyArray<SettingsPage> = SETTINGS_PAGES.map((id) => ({ id, ...PAGES[id] }));
