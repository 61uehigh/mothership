"use client";

import { ExternalLink, RotateCw, SquareTerminal } from "lucide-react";
import { useState, type ReactNode } from "react";
import { SETTINGS_BUTTON as SECONDARY, SETTINGS_PRIMARY_BUTTON as PRIMARY } from "@/features/settings/ui/settingsLayout";
import { useT } from "@/ui/i18n/useT";
import { fetchJson, jsonRequest } from "@/ui/useJson";
import type { SetupAction } from "@/features/settings/model/Settings";

/**
 * ### SetupButton
 *
 * Starts a setup step on this computer. Logins open a Terminal window, where you
 * finish in your browser; afterwards, Check again shows the new state.
 *
 * @param primary - The main next step, drawn filled.
 */
export function SetupButton({ action, label, primary = false }: { action: SetupAction; label: string; primary?: boolean }) {
  const t = useT();
  const [state, setState] = useState<{ busy: boolean; started: boolean; error: string | undefined }>({ busy: false, started: false, error: undefined });

  async function start() {
    setState({ busy: true, started: false, error: undefined });
    const result = await fetchJson<null>("/api/settings/setup", jsonRequest("POST", { action }));
    setState({ busy: false, started: result.ok, error: result.ok ? undefined : result.error });
  }

  const opensTerminal = action !== "docker-start";
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" disabled={state.busy} onClick={() => void start()} className={primary ? PRIMARY : SECONDARY}>
        {opensTerminal && <SquareTerminal size={13} aria-hidden />}
        {label}
      </button>
      {state.started && (
        <span role="status" className="text-xs text-zinc-500">
          {opensTerminal ? t("settings.setup.finishInTerminal") : t("settings.setup.starting")}
        </span>
      )}
      {state.error !== undefined && (
        <span role="alert" className="text-xs text-red-600 dark:text-red-400">
          {state.error}
        </span>
      )}
    </span>
  );
}

/**
 * ### ExternalButton
 *
 * A link to a download or docs page, drawn as a button; opens in your browser.
 */
export function ExternalButton({ href, children, primary = false }: { href: string; children: ReactNode; primary?: boolean }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={primary ? PRIMARY : SECONDARY}>
      {children}
      <ExternalLink size={12} aria-hidden />
    </a>
  );
}

/**
 * ### Steps
 *
 * Numbered setup steps under a tool that isn't ready.
 */
export function Steps({ children }: { children: Array<ReactNode> }) {
  return (
    <ol className="flex flex-col gap-2 pl-4 text-xs text-zinc-600 dark:text-zinc-400">
      {children.map((step, i) => (
        <li key={i} className="flex flex-wrap items-center gap-2">
          <span className="text-zinc-500">{i + 1}.</span>
          {step}
        </li>
      ))}
    </ol>
  );
}

/**
 * ### CheckAgainButton
 *
 * Re-runs the readiness checks after you set something up.
 */
export function CheckAgainButton({ onCheck }: { onCheck: () => Promise<void> }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void onCheck().finally(() => setBusy(false));
      }}
      className={SECONDARY}
    >
      <RotateCw size={12} aria-hidden className={busy ? "animate-spin" : ""} />
      {t("settings.checkAgain")}
    </button>
  );
}
