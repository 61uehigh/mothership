import { isMcpDisconnected, mcpConnectionChip } from "@/features/settings/model/connectionStatus";
import { focusSettingsCard } from "@/shell/settingsPage";
import { InboxRulesEditor, type InboxIntegration } from "@/features/settings/ui/InboxRulesEditor";
import { MeetingCollectionsEditor } from "@/features/settings/ui/MeetingCollectionsEditor";
import { SidebarsEditor } from "@/features/settings/ui/SidebarsEditor";
import { PageSection } from "@/ui/PageSection";
import type { SettingsPageContext } from "@/features/settings/ui/settingsPages";
import { useT } from "@/ui/i18n/useT";
import { SELECTED_NAV, UNSELECTED_NAV } from "@/ui/selection";

const SECTIONS = [
  { id: "workspace", label: "settings.workspace.sidebars" },
  { id: "workspace/inbox", label: "settings.workspace.inboxRules" },
  { id: "workspace/meetings", label: "settings.workspace.meetings" },
] as const;

/**
 * ### WorkspacePage
 *
 * Settings for the workbench sidebars, Inbox sorting, and the collections shown in Meetings.
 */
export function WorkspacePage({ destination, view, send, showPage }: SettingsPageContext) {
  const t = useT();
  const disconnected = new Set<InboxIntegration>();
  // Set up but refused (e.g. a bad key): fixed on its card, not by connecting from scratch.
  const failing = new Set<InboxIntegration>();
  if (!view.tools.github.ready) disconnected.add("github");
  for (const id of ["slack", "google_calendar", "linear"] as const) {
    const connection = view.connections.find((item) => item.id === id);
    if (connection === undefined || isMcpDisconnected(connection)) disconnected.add(id);
    if (connection !== undefined && mcpConnectionChip(connection, connection.last).state === "not-working") failing.add(id);
  }
  if (view.accounts.gmail !== "signed-in") disconnected.add("gmail");

  return (
    <>
      <nav aria-label={t("settings.workspace.nav")} className="flex flex-wrap gap-1 border-b border-zinc-200 pb-2 dark:border-zinc-800">
        {SECTIONS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            aria-current={destination === id ? "page" : undefined}
            onClick={() => showPage(id)}
            className={`rounded-md px-3 py-2 text-sm ${destination === id ? SELECTED_NAV : UNSELECTED_NAV}`}
          >
            {t(label)}
          </button>
        ))}
      </nav>
      {destination === "workspace" && (
        <PageSection title={t("settings.workspace.sidebars")} description={t("settings.workspace.sidebarsDescription")}>
          <SidebarsEditor />
        </PageSection>
      )}
      {destination === "workspace/inbox" && (
        <PageSection title={t("settings.workspace.inboxRules")} description={t("settings.workspace.inboxRulesDescription")}>
          <InboxRulesEditor
            rules={view.inbox}
            disconnected={disconnected}
            claudeReady={view.agents.claude.ready}
            onSave={(inbox) => send("/api/settings", "PATCH", { inbox })}
            failing={failing}
            onConnect={(integration) => {
              showPage("connections");
              if (integration !== "github") focusSettingsCard(integration);
            }}
          />
        </PageSection>
      )}
      {destination === "workspace/meetings" && (
        <PageSection title={t("settings.workspace.meetings")} description={t("settings.workspace.meetingsDescription")}>
          <MeetingCollectionsEditor
            collections={view.meetings.collections}
            onSave={(collections) => send("/api/settings", "PATCH", { meetings: { collections } })}
            onFix={(fix) => {
              showPage(fix.page);
              if (fix.page === "connections") focusSettingsCard(fix.card);
            }}
          />
        </PageSection>
      )}
    </>
  );
}
