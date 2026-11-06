"use client";

import { Check, Copy, ExternalLink, RotateCw, SquareTerminal } from "lucide-react";
import { useState, type ReactNode } from "react";
import { fetchJson } from "@/ui/useJson";

const BUTTON = "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs disabled:opacity-40";
const PRIMARY = `${BUTTON} border-teal-600 bg-teal-600 font-medium text-white hover:bg-teal-500`;
const SECONDARY = `${BUTTON} border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800`;

/**
 * ### SetupActionName
 *
 * Setup steps the server can start (see `SETUP_ACTIONS`).
 */
export type SetupActionName = "claude-login" | "codex-login" | "gh-login" | "docker-start";

/**
 * ### SetupButton
 *
 * Starts a setup step on this Mac. Logins open a Terminal window, where you
 * finish in your browser; afterwards, Check again shows the new state.
 *
 * @param primary - The main next step, drawn filled.
 */
export function SetupButton({ action, label, primary = false }: { action: SetupActionName; label: string; primary?: boolean }) {
  const [state, setState] = useState<{ busy: boolean; started: boolean; error: string | undefined }>({ busy: false, started: false, error: undefined });

  async function start() {
    setState({ busy: true, started: false, error: undefined });
    const result = await fetchJson<null>("/api/settings/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
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
          {opensTerminal ? "Finish in the Terminal window, then check again." : "Starting… check again in a moment."}
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
 * ### CommandLine
 *
 * A command to run yourself, with a copy button.
 */
export function CommandLine({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-zinc-100 py-0.5 pr-0.5 pl-2 dark:border-zinc-700 dark:bg-zinc-900">
      <code className="font-mono text-[11px]">{command}</code>
      <button
        type="button"
        aria-label={`Copy ${command}`}
        title="Copy"
        className="rounded p-1 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
        onClick={() => {
          void navigator.clipboard.writeText(command).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />}
      </button>
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
      Check again
    </button>
  );
}
