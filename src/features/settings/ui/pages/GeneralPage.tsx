import { Bell, BellOff, Globe, Languages, Monitor, Moon, Sun } from "lucide-react";
import { useState } from "react";
import type { SettingsPageContext } from "@/features/settings/ui/settingsPages";
import { SETTINGS_LIST, SETTINGS_ROW, SaveStatus, useSave } from "@/features/settings/ui/settingsLayout";
import { TimeZonePicker } from "@/features/settings/ui/TimeZonePicker";
import { PageSection } from "@/ui/PageSection";
import { useShell } from "@/shell/shellContext";
import { LOCALES } from "@/ui/i18n/translate";
import { useLocale, useT } from "@/ui/i18n/useT";
import { SegmentedControl } from "@/ui/SegmentedControl";
import { SELECTED_SEGMENT, UNSELECTED_SEGMENT } from "@/ui/selection";
import { useTheme, type Theme } from "@/ui/theme";

const THEME_ICON = { light: Sun, dark: Moon, auto: Monitor } as const;

const SEGMENTS = "inline-grid grid-flow-col auto-cols-fr items-center gap-0.5 rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-800/70";
const segment = (selected: boolean) => `min-h-7 rounded-md px-2.5 text-xs whitespace-nowrap ${selected ? SELECTED_SEGMENT : UNSELECTED_SEGMENT}`;

/**
 * ### GeneralPage
 *
 * App-wide appearance (light, dark, or following the system), the UI's
 * language, the time zone, and browser notification preferences.
 */
export function GeneralPage({ view, send }: Pick<SettingsPageContext, "view" | "send">) {
  const t = useT();
  const { theme, setTheme } = useTheme();
  const { locale, setLocale } = useLocale();
  const ThemeIcon = THEME_ICON[theme];
  const { notifications } = useShell();
  const themeOptions: Array<{ value: Theme; label: string }> = [
    { value: "light", label: t("general.themeLight") },
    { value: "dark", label: t("general.themeDark") },
    { value: "auto", label: t("general.themeAuto") },
  ];
  const notificationState = {
    granted: t("general.notificationsGranted"),
    muted: t("general.notificationsMuted"),
    denied: t("general.notificationsDenied"),
    default: t("general.notificationsDefault"),
  } as const;
  return (
    <>
      <PageSection title={t("general.appearance")}>
        <div className={SETTINGS_LIST}>
          <div className={`${SETTINGS_ROW} hover:bg-transparent dark:hover:bg-transparent`}>
            <ThemeIcon size={14} aria-hidden />
            <span className="flex-1">{t("general.theme")}</span>
            <SegmentedControl label={t("general.theme")} options={themeOptions} value={theme} onChange={setTheme} className={SEGMENTS} optionClassName={segment} />
          </div>
          <div className={`${SETTINGS_ROW} hover:bg-transparent dark:hover:bg-transparent`}>
            <Languages size={14} aria-hidden />
            {/* Named in both languages, so it can be found whichever one is showing. */}
            <span className="flex-1">{locale === "en" ? "Language" : `${t("general.language")} · Language`}</span>
            <SegmentedControl label={t("general.language")} options={LOCALES} value={locale} onChange={setLocale} className={SEGMENTS} optionClassName={segment} />
          </div>
        </div>
      </PageSection>
      <TimeZoneSection view={view} send={send} />
      {notifications.state !== "unsupported" && (
        <PageSection title={t("general.notifications")}>
          <div className={SETTINGS_LIST}>
            <button type="button" className={SETTINGS_ROW} onClick={notifications.toggle}>
              {notifications.state === "granted" ? <Bell size={14} aria-hidden /> : <BellOff size={14} aria-hidden />}
              <span className="flex-1">{t("general.browserNotifications")}</span>
              <span className="text-xs text-zinc-500">{notificationState[notifications.state]}</span>
            </button>
          </div>
          {notifications.state === "denied" && <p className="text-xs text-zinc-500">{t("general.notificationsDeniedHelp")}</p>}
        </PageSection>
      )}
    </>
  );
}

/** The zone for the calendar and "today": automatic follows this computer (or `dashboard.yaml`) until you choose one. */
function TimeZoneSection({ view, send }: Pick<SettingsPageContext, "view" | "send">) {
  const t = useT();
  const { chosen, automatic } = view.timezone;
  const [timezone, setTimezone] = useState(chosen ?? "");
  const { state, save } = useSave((zone: string) => send("/api/settings", "PATCH", { timezone: zone }));
  return (
    <PageSection title={t("general.region")}>
      <div className="flex flex-col gap-1.5 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
        <label htmlFor="general-timezone" className="flex items-center gap-2 text-[13px]">
          <Globe size={14} aria-hidden />
          {t("general.timezone")}
        </label>
        <TimeZonePicker
          id="general-timezone"
          value={timezone}
          automatic={automatic}
          disabled={state.busy}
          onChange={(zone) => {
            setTimezone(zone);
            void save(zone);
          }}
        />
        <span className="text-[11px] text-zinc-500">{t("general.timezoneHelp")}</span>
        <SaveStatus state={state} />
      </div>
    </PageSection>
  );
}
