"use client";

import { useState } from "react";
import { SLACK_PERMISSIONS, defaultSlackChoice, slackCreateAppUrl, slackManifest, type SlackPermission } from "@/features/settings/model/slackManifest";
import { SetupStep } from "@/features/settings/ui/setupChecklist";
import { SETTINGS_BUTTON } from "@/features/settings/ui/settingsLayout";
import { ExternalButton } from "@/features/settings/ui/setupSteps";
import { CopyButton } from "@/ui/CopyButton";
import type { Translate } from "@/ui/i18n/translate";
import { useT } from "@/ui/i18n/useT";

/** A permission's name and use in the chosen language; one added later shows its English words. */
function permissionText(t: Translate, permission: SlackPermission): { label: string; detail: string } {
  switch (permission.id) {
    case "search":
      return { label: t("settings.slack.perm.search"), detail: t("settings.slack.perm.searchDetail") };
    case "history":
      return { label: t("settings.slack.perm.history"), detail: t("settings.slack.perm.historyDetail") };
    case "send":
      return { label: t("settings.slack.perm.send"), detail: t("settings.slack.perm.sendDetail") };
    case "people":
      return { label: t("settings.slack.perm.people"), detail: t("settings.slack.perm.peopleDetail") };
    case "files":
      return { label: t("settings.slack.perm.files"), detail: t("settings.slack.perm.filesDetail") };
    case "canvases":
      return { label: t("settings.slack.perm.canvases"), detail: t("settings.slack.perm.canvasesDetail") };
    default:
      return { label: permission.label, detail: permission.detail };
  }
}

/**
 * ### SlackSteps
 *
 * The steps before pasting a Slack user token: create a Slack app from the
 * manifest your permission choices make (prefilled, or pasted), and install
 * it. They go in a `SetupChecklist` ahead of the card's paste step.
 *
 * @param done - The token is saved, so these steps are behind you.
 */
export function SlackSteps({ done }: { done: boolean }) {
  const t = useT();
  const [chosen, setChosen] = useState<Array<string>>(defaultSlackChoice);
  const [choosing, setChoosing] = useState(false);
  const manifest = JSON.stringify(slackManifest(chosen), null, 2);
  const count = SLACK_PERMISSIONS.filter((p) => p.required === true || chosen.includes(p.id)).length;

  function toggle(id: string, on: boolean) {
    setChosen((current) => (on ? [...current, id] : current.filter((c) => c !== id)));
  }

  return (
    <>
      <SetupStep
        done={done}
        label={t("settings.slack.createApp")}
        hint={t("settings.slack.createAppHint")}
        below={choosing && <SlackPermissions chosen={chosen} manifest={manifest} onToggle={toggle} />}
      >
        <button type="button" className={SETTINGS_BUTTON} aria-expanded={choosing} onClick={() => setChoosing((open) => !open)}>
          {t("settings.slack.permissions", { count })}
        </button>
        <ExternalButton href={slackCreateAppUrl(chosen)} primary>
          {t("settings.slack.createInSlack")}
        </ExternalButton>
      </SetupStep>
      <SetupStep done={done} label={t("settings.slack.install")} hint={t("settings.slack.installHint")}>
        <ExternalButton href="https://api.slack.com/apps">{t("settings.slack.openApps")}</ExternalButton>
      </SetupStep>
    </>
  );
}

/** What mothership may do in Slack, and the manifest those choices make. */
function SlackPermissions({ chosen, manifest, onToggle }: { chosen: Array<string>; manifest: string; onToggle: (id: string, on: boolean) => void }) {
  const t = useT();
  return (
    <div className="flex flex-col gap-1.5 py-1">
      <div className="grid gap-1 sm:grid-cols-2">
        {SLACK_PERMISSIONS.map((permission) => {
          const text = permissionText(t, permission);
          return (
          <label key={permission.id} title={permission.scopes.join(", ")} className="flex items-start gap-2 rounded-md border border-zinc-200 px-2 py-1.5 dark:border-zinc-800">
            <input
              type="checkbox"
              className="mt-0.5 accent-teal-600"
              checked={permission.required === true || chosen.includes(permission.id)}
              disabled={permission.required === true}
              onChange={(event) => onToggle(permission.id, event.target.checked)}
            />
            <span className="flex flex-col">
              <span className="text-zinc-800 dark:text-zinc-200">
                {text.label}
                {permission.required === true && <span className="text-zinc-500"> · {t("settings.slack.needed")}</span>}
              </span>
              <span className="text-[11px] text-zinc-500">{text.detail}</span>
            </span>
          </label>
          );
        })}
      </div>
      <span className="flex flex-wrap items-center gap-2 text-zinc-500">
        {t("settings.slack.manifest")}
        <CopyButton text={manifest} what={t("settings.slack.manifestWhat")} labelled />
      </span>
    </div>
  );
}
