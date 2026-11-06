import { useEffect, useState } from "react";
import { SETTINGS_FOCUS_EVENT, SETTINGS_FOCUS_KEY } from "@/shell/settingsPage";
import type { ConnectionMode, ConnectionView } from "@/features/settings/model/Settings";
import { ConnectionCard } from "@/features/settings/ui/ConnectionCard";
import { GmailCard } from "@/features/settings/ui/GmailCard";
import { GoogleGroupCard } from "@/features/settings/ui/googleGroupCard";
import { KakaoCard } from "@/features/settings/ui/KakaoCard";
import { YouTubeMusicCard } from "@/features/settings/ui/YouTubeMusicCard";
import type { SettingsPageContext } from "@/features/settings/ui/settingsPages";
import { LocalToolsSection } from "@/features/settings/ui/pages/LocalToolsSection";
import { PageSection } from "@/ui/PageSection";
import { useT } from "@/ui/i18n/useT";

/**
 * ### ConnectionsPage
 *
 * How the sidebar and agents reach each work tool, with a card per tool.
 * Google Calendar and Gmail come first as rows of one Google card, under
 * the OAuth client they share; YouTube Music, a personal account with its own client, stays
 * out of it.
 */
export function ConnectionsPage({ view, send, saveSecret, recheck }: SettingsPageContext) {
  const t = useT();
  const calendar = view.connections.find((connection) => connection.id === "google_calendar");
  const client = calendar?.secrets.find((secret) => secret.name === "GOOGLE_OAUTH_CREDENTIALS");
  // Counts saved client changes: a sign-in made with the old client no longer counts, so Gmail's card starts over.
  const [clientRevision, setClientRevision] = useState(0);
  async function changeClient(content: string | null): Promise<string | undefined> {
    const failure = await (content === null ? send("/api/settings/google/client", "DELETE", undefined) : send("/api/settings/google/client", "PUT", { content }));
    if (failure === undefined) setClientRevision((n) => n + 1);
    return failure;
  }
  useFocusedCard();
  const card = (connection: ConnectionView, nested = false) => (
    <ConnectionCard
      key={connection.id}
      nested={nested}
      connection={connection}
      locked={view.customConfig !== undefined}
      onMode={(mode: ConnectionMode | "default") => send("/api/settings", "PATCH", { connections: { [connection.id]: mode } })}
      onSecret={saveSecret}
      onRequest={send}
      onRefresh={recheck}
    />
  );

  return (
    <>
      <PageSection description={t("settings.connections.description")}>
        {view.customConfig !== undefined && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
            {t("settings.connections.demoMode", { config: view.customConfig })}
          </p>
        )}
        <GoogleGroupCard secret={client} onClient={changeClient} inUse={calendar?.mode === "mcp" || view.accounts.gmail !== "unconfigured"}>
          {calendar !== undefined && card(calendar, true)}
          <GmailCard key={clientRevision} nested />
        </GoogleGroupCard>
        {view.connections.filter((connection) => connection.id !== "google_calendar").map((connection) => card(connection))}
        <KakaoCard />
        <YouTubeMusicCard />
      </PageSection>
      <LocalToolsSection view={view} recheck={recheck} />
    </>
  );
}

const HIGHLIGHT = ["outline-2", "outline-offset-2", "outline-teal-500"];

/** Scrolls to the card a sidebar asked for (its `data-connection`) and outlines it for a moment. */
function useFocusedCard() {
  useEffect(() => {
    const focus = () => {
      let id: string | null = null;
      try {
        id = sessionStorage.getItem(SETTINGS_FOCUS_KEY);
        sessionStorage.removeItem(SETTINGS_FOCUS_KEY);
      } catch {
        return;
      }
      if (id === null) return;
      const target = id;
      // After the switch to this page has rendered.
      requestAnimationFrame(() => {
        const element = document.querySelector<HTMLElement>(`[data-connection="${CSS.escape(target)}"]`);
        if (element === null) return;
        element.scrollIntoView({ block: "center", behavior: "smooth" });
        element.classList.add(...HIGHLIGHT);
        setTimeout(() => element.classList.remove(...HIGHLIGHT), 1600);
      });
    };
    focus();
    window.addEventListener(SETTINGS_FOCUS_EVENT, focus);
    return () => window.removeEventListener(SETTINGS_FOCUS_EVENT, focus);
  }, []);
}
