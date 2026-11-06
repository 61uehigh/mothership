import { useState } from "react";
import type { SettingsPageContext } from "@/features/settings/ui/settingsPages";
import { SETTINGS_INPUT, SETTINGS_SAVE_BUTTON, SaveStatus, SettingsSection, useSave } from "@/features/settings/ui/settingsLayout";

/** Names shorter than this would highlight too much text as a mention. */
const MIN_NAME_LENGTH = 2;

/**
 * ### ProfilePage
 *
 * The names, Slack member id, and time zone mothership uses to find what is about you.
 */
export function ProfilePage({ view, send }: SettingsPageContext) {
  const [names, setNames] = useState(view.profile.names.join(", "));
  const [slackUserId, setSlackUserId] = useState(view.profile.slackUserId ?? "");
  const [timezone, setTimezone] = useState(view.profile.timezone);
  const { state, save } = useSave(() =>
    send("/api/settings", "PATCH", {
      profile: {
        names: names
          .split(",")
          .map((n) => n.trim())
          .filter((n) => n.length >= MIN_NAME_LENGTH),
        slackUserId: slackUserId.trim(),
        timezone: timezone.trim(),
      },
    }),
  );

  return (
    <SettingsSection title="Profile">
      <form
        className="grid gap-3 rounded-lg border border-zinc-200 p-4 sm:grid-cols-2 dark:border-zinc-800"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <label className="flex flex-col gap-1 text-xs text-zinc-600 sm:col-span-2 dark:text-zinc-400">
          Names you go by
          <input className={SETTINGS_INPUT} value={names} onChange={(e) => setNames(e.target.value)} placeholder="Jane Doe, Jane" />
          <span className="text-[11px] text-zinc-500">Comma-separated. Highlighted wherever Slack, Linear, or Nuclino mention you by name.</span>
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
          Slack member ID
          <input className={`${SETTINGS_INPUT} font-mono`} value={slackUserId} onChange={(e) => setSlackUserId(e.target.value)} placeholder="U0123456789" />
          <span className="text-[11px] text-zinc-500">Slack profile → ⋮ → Copy member ID. Finds your mentions and DMs.</span>
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
          Time zone
          <input className={SETTINGS_INPUT} value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="Asia/Seoul" />
          <span className="text-[11px] text-zinc-500">For the calendar and &ldquo;today&rdquo;. The clock at the bottom right shows this Mac&apos;s own time.</span>
        </label>
        <div className="flex items-center gap-2 sm:col-span-2">
          <button type="submit" disabled={state.busy} className={SETTINGS_SAVE_BUTTON}>
            Save
          </button>
          <SaveStatus state={state} />
        </div>
      </form>
    </SettingsSection>
  );
}
