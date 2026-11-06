"use client";

import { useState } from "react";
import { SLACK_PERMISSIONS, defaultSlackChoice, slackCreateAppUrl, slackManifest } from "@/features/settings/model/slackManifest";
import { SetupStep } from "@/features/settings/ui/setupChecklist";
import { SETTINGS_BUTTON } from "@/features/settings/ui/settingsLayout";
import { ExternalButton } from "@/features/settings/ui/SetupSteps";
import { CopyButton } from "@/ui/CopyButton";

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
        label="Create the Slack app"
        hint="Pick your workspace, then Next → Create. MCP server access is turned on for you."
        below={choosing && <SlackPermissions chosen={chosen} manifest={manifest} onToggle={toggle} />}
      >
        <button type="button" className={SETTINGS_BUTTON} aria-expanded={choosing} onClick={() => setChoosing((open) => !open)}>
          Permissions ({count})
        </button>
        <ExternalButton href={slackCreateAppUrl(chosen)} primary>
          Create in Slack
        </ExternalButton>
      </SetupStep>
      <SetupStep done={done} label="Install it to your workspace" hint="In the new app: Install to Workspace → Allow">
        <ExternalButton href="https://api.slack.com/apps">Open your Slack apps</ExternalButton>
      </SetupStep>
    </>
  );
}

/** What mothership may do in Slack, and the manifest those choices make. */
function SlackPermissions({ chosen, manifest, onToggle }: { chosen: Array<string>; manifest: string; onToggle: (id: string, on: boolean) => void }) {
  return (
    <div className="flex flex-col gap-1.5 py-1">
      <div className="grid gap-1 sm:grid-cols-2">
        {SLACK_PERMISSIONS.map((permission) => (
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
                {permission.label}
                {permission.required === true && <span className="text-zinc-500"> · needed</span>}
              </span>
              <span className="text-[11px] text-zinc-500">{permission.detail}</span>
            </span>
          </label>
        ))}
      </div>
      <span className="flex flex-wrap items-center gap-2 text-zinc-500">
        Or paste the manifest in Create New App → From a manifest
        <CopyButton text={manifest} what="Slack app manifest" labelled />
      </span>
    </div>
  );
}
