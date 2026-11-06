import { Bug, ChevronRight, FolderOpen } from "lucide-react";
import { useState } from "react";
import type { SettingsPageContext } from "@/features/settings/ui/settingsPages";
import { SETTINGS_BUTTON, SETTINGS_INPUT, SETTINGS_LIST, SETTINGS_ROW, SETTINGS_SAVE_BUTTON, type SaveState, SaveStatus, useSave } from "@/features/settings/ui/settingsLayout";
import { PageSection } from "@/ui/PageSection";
import { formatBinding } from "@/shell/commands/keys";
import { useShell } from "@/shell/shellContext";
import { useWorkbenchActions } from "@/shell/workbenchContext";
import { FolderField } from "@/ui/FolderField";
import { useT } from "@/ui/i18n/useT";
import { fetchJson } from "@/ui/useJson";

/**
 * ### AdvancedPage
 *
 * App configuration files, developer mode, and the checkout used by feedback sessions.
 */
export function AdvancedPage({ view, send }: SettingsPageContext) {
  const t = useT();
  const { developerMode } = useShell();
  const workbench = useWorkbenchActions();
  const [folder, setFolder] = useState(view.developer.chosen ? (view.developer.sourceFolder ?? "") : "");
  const { state, save, fail } = useSave((developer: { enabled?: boolean; sourceFolder?: string }) => send("/api/settings", "PATCH", { developer }));

  const [config, setConfig] = useState<SaveState>({ busy: false, message: undefined, failed: false });

  async function openConfigFolder() {
    setConfig({ busy: true, message: undefined, failed: false });
    const result = await fetchJson<{ folder: string }>("/api/settings/config-folder", { method: "POST" });
    setConfig({ busy: false, message: result.ok ? undefined : result.error, failed: !result.ok });
  }

  return (
    <>
      <PageSection
        title={t("settings.advanced.developerMode")}
        description={t("settings.advanced.developerModeDescription", { key: formatBinding("mod+alt+f") })}
      >
        <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={view.developer.enabled} disabled={state.busy} onChange={(e) => void save({ enabled: e.target.checked })} />
            {t("settings.advanced.developerMode")}
          </label>
          <form
            className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400"
            onSubmit={(event) => {
              event.preventDefault();
              void save({ sourceFolder: folder.trim() });
            }}
          >
            {t("settings.advanced.sourceFolder")}
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <FolderField
                  className={`${SETTINGS_INPUT} font-mono`}
                  placeholder={view.developer.sourceFolder === undefined ? "/Users/you/projects/mothership" : t("settings.advanced.thisCheckout", { folder: view.developer.sourceFolder })}
                  value={folder}
                  onChange={setFolder}
                  onError={fail}
                />
              </div>
              <button type="submit" disabled={state.busy} className={SETTINGS_SAVE_BUTTON}>
                {t("settings.save")}
              </button>
            </div>
            <span className="text-[11px] text-zinc-500">{t("settings.advanced.sourceFolderHelp")}</span>
          </form>
          <SaveStatus state={state} />
        </div>
        {developerMode && (
          <div className={SETTINGS_LIST}>
            <button type="button" className={SETTINGS_ROW} onClick={() => workbench.open({ kind: "debug" })}>
              <Bug size={14} aria-hidden />
              <span className="flex-1">{t("settings.advanced.debugPanel")}</span>
              <ChevronRight size={14} aria-hidden className="text-zinc-400" />
            </button>
          </div>
        )}
      </PageSection>
      <PageSection title={t("settings.advanced.configFiles")} description={t("settings.advanced.configFilesDescription")}>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={SETTINGS_BUTTON} disabled={config.busy} onClick={() => void openConfigFolder()}>
            <FolderOpen size={14} aria-hidden />
            {config.busy ? t("settings.advanced.opening") : t("settings.advanced.openConfig")}
          </button>
          <SaveStatus state={config} />
        </div>
      </PageSection>
    </>
  );
}
