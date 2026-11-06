import type { ConnectionMode } from "@/features/settings/model/Settings";
import { ConnectionCard } from "@/features/settings/ui/ConnectionCard";
import { KakaoCard } from "@/features/settings/ui/KakaoCard";
import { YouTubeMusicCard } from "@/features/settings/ui/YouTubeMusicCard";
import type { SettingsPageContext } from "@/features/settings/ui/settingsPages";
import { LocalToolsSection } from "@/features/settings/ui/pages/LocalToolsSection";
import { SettingsSection } from "@/features/settings/ui/settingsLayout";

/**
 * ### ConnectionsPage
 *
 * How the sidebar and agents reach each work tool, with a card per tool.
 */
export function ConnectionsPage({ view, send, saveSecret, recheck }: SettingsPageContext) {
  return (
    <>
      <SettingsSection
        title="Connections"
        description="Connect your work tools to the sidebar and agents."
      >
        {view.customConfig !== undefined && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
            Using {view.customConfig} (demo mode), so the choices below are not applied.
          </p>
        )}
        {view.connections.map((connection) => (
          <ConnectionCard
            key={connection.id}
            connection={connection}
            locked={view.customConfig !== undefined}
            onMode={(mode: ConnectionMode | "default") => void send("/api/settings", "PATCH", { connections: { [connection.id]: mode } })}
            onSecret={saveSecret}
            onRequest={send}
            onRefresh={recheck}
          />
        ))}
        <KakaoCard onSecret={saveSecret} />
        <YouTubeMusicCard />
      </SettingsSection>
      <LocalToolsSection view={view} recheck={recheck} />
    </>
  );
}
