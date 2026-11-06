import { useState } from "react";
import { PROFILE_NAME_MIN } from "@/features/settings/model/Settings";
import type { SettingsPageContext } from "@/features/settings/ui/settingsPages";
import { SETTINGS_INPUT, SETTINGS_SAVE_BUTTON, SaveStatus, useSave } from "@/features/settings/ui/settingsLayout";
import { PageSection } from "@/ui/PageSection";
import { useT } from "@/ui/i18n/useT";

/**
 * ### ProfilePage
 *
 * The names and Slack member id mothership uses to find what is about you.
 */
export function ProfilePage({ view, send }: SettingsPageContext) {
  const t = useT();
  const [names, setNames] = useState(view.profile.names.join(", "));
  const [slackUserId, setSlackUserId] = useState(view.profile.slackUserId ?? "");
  const { state, save } = useSave(() =>
    send("/api/settings", "PATCH", {
      profile: {
        names: names
          .split(",")
          .map((n) => n.trim())
          .filter((n) => n.length >= PROFILE_NAME_MIN),
        slackUserId: slackUserId.trim(),
      },
    }),
  );

  return (
    <PageSection description={t("settings.profile.description")}>
      <form
        className="grid gap-3 rounded-lg border border-zinc-200 p-4 sm:grid-cols-2 dark:border-zinc-800"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <label className="flex flex-col gap-1 text-xs text-zinc-600 sm:col-span-2 dark:text-zinc-400">
          {t("settings.profile.names")}
          <input className={SETTINGS_INPUT} value={names} onChange={(e) => setNames(e.target.value)} placeholder={t("settings.profile.namesPlaceholder")} />
          <span className="text-[11px] text-zinc-500">{t("settings.profile.namesHelp")}</span>
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
          {t("settings.profile.slackId")}
          <input className={`${SETTINGS_INPUT} font-mono`} value={slackUserId} onChange={(e) => setSlackUserId(e.target.value)} placeholder={t("settings.profile.slackIdPlaceholder")} />
          <span className="text-[11px] text-zinc-500">{t("settings.profile.slackIdHelp")}</span>
        </label>
        <div className="flex items-center gap-2 sm:col-span-2">
          <button type="submit" disabled={state.busy} className={SETTINGS_SAVE_BUTTON}>
            {t("settings.save")}
          </button>
          <SaveStatus state={state} />
        </div>
      </form>
    </PageSection>
  );
}
