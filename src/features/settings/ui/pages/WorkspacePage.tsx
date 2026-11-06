import { isMcpDisconnected } from "@/features/settings/model/connectionStatus";
import { InboxRulesEditor, type InboxIntegration } from "@/features/settings/ui/InboxRulesEditor";
import { MeetingCollectionsEditor } from "@/features/settings/ui/MeetingCollectionsEditor";
import { SidebarsEditor } from "@/features/settings/ui/SidebarsEditor";
import { SettingsSection } from "@/features/settings/ui/settingsLayout";
import type { SettingsPageContext } from "@/features/settings/ui/settingsPages";
import { SELECTED_NAV, UNSELECTED_NAV } from "@/ui/selection";

const SECTIONS = [
  { id: "workspace", label: "Sidebars" },
  { id: "workspace/inbox", label: "Inbox rules" },
  { id: "workspace/meetings", label: "Meeting collections" },
] as const;

/**
 * ### WorkspacePage
 *
 * Settings for the workbench sidebars, Inbox sorting, and the collections shown in Meetings.
 */
export function WorkspacePage({ destination, view, send, showPage }: SettingsPageContext) {
  const disconnected = new Set<InboxIntegration>();
  if (!view.tools.github.ready) disconnected.add("github");
  for (const id of ["slack", "google_calendar", "linear"] as const) {
    const connection = view.connections.find((item) => item.id === id);
    if (connection === undefined || isMcpDisconnected(connection)) disconnected.add(id);
  }

  return (
    <>
      <nav aria-label="Workspace settings" className="flex flex-wrap gap-1 border-b border-zinc-200 pb-2 dark:border-zinc-800">
        {SECTIONS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            aria-current={destination === id ? "page" : undefined}
            onClick={() => showPage(id)}
            className={`rounded-md px-3 py-2 text-sm ${destination === id ? SELECTED_NAV : UNSELECTED_NAV}`}
          >
            {label}
          </button>
        ))}
      </nav>
      {destination === "workspace" && (
        <SettingsSection title="Sidebars" description="Choose what each sidebar shows. Drag sections to reorder them or use the buttons.">
          <SidebarsEditor />
        </SettingsSection>
      )}
      {destination === "workspace/inbox" && (
        <SettingsSection title="Inbox rules" description="Choose where each type of item appears. Off keeps it out of your Inbox.">
          <InboxRulesEditor
            rules={view.inbox}
            disconnected={disconnected}
            claudeReady={view.agents.claude.ready}
            onSave={(inbox) => send("/api/settings", "PATCH", { inbox })}
          />
        </SettingsSection>
      )}
      {destination === "workspace/meetings" && (
        <SettingsSection title="Meeting collections" description="Choose the Nuclino collections whose notes appear in Meetings.">
          <MeetingCollectionsEditor
            collections={view.meetings.collections}
            onSave={(collections) => send("/api/settings", "PATCH", { meetings: { collections } })}
          />
        </SettingsSection>
      )}
    </>
  );
}
