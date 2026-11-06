import { Bell, BellOff, Moon, Sun } from "lucide-react";
import { SETTINGS_LIST, SETTINGS_ROW, SettingsSection } from "@/features/settings/ui/settingsLayout";
import { useShell } from "@/shell/ShellContext";
import { useTheme } from "@/ui/theme";

const NOTIFICATION_STATE_LABEL = { granted: "On", muted: "Muted", denied: "Blocked", default: "Not set" } as const;

/**
 * ### GeneralPage
 *
 * App-wide appearance and browser notification preferences.
 */
export function GeneralPage() {
  const { theme, toggle } = useTheme();
  const { notifications } = useShell();
  return (
    <>
      <SettingsSection title="Appearance">
        <div className={SETTINGS_LIST}>
          <button type="button" className={SETTINGS_ROW} onClick={toggle}>
            {theme === "dark" ? <Moon size={14} aria-hidden /> : <Sun size={14} aria-hidden />}
            <span className="flex-1">Theme</span>
            <span className="text-xs text-zinc-500">{theme === "dark" ? "Dark" : "Light"}</span>
          </button>
        </div>
      </SettingsSection>
      {notifications.state !== "unsupported" && (
        <SettingsSection title="Notifications">
          <div className={SETTINGS_LIST}>
            <button type="button" className={SETTINGS_ROW} onClick={notifications.toggle}>
              {notifications.state === "granted" ? <Bell size={14} aria-hidden /> : <BellOff size={14} aria-hidden />}
              <span className="flex-1">Browser notifications</span>
              <span className="text-xs text-zinc-500">{NOTIFICATION_STATE_LABEL[notifications.state]}</span>
            </button>
          </div>
        </SettingsSection>
      )}
    </>
  );
}
