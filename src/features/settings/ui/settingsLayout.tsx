import { useState, type ReactNode } from "react";
import type { CheckResult } from "@/features/settings/model/Settings";

/**
 * ### SETTINGS_INPUT
 *
 * The text field style of Settings' forms.
 */
export const SETTINGS_INPUT = "w-full rounded-md border border-zinc-300 bg-transparent px-2.5 py-1 text-xs dark:border-zinc-700";

/**
 * ### SETTINGS_SAVE_BUTTON
 *
 * The primary Save button of Settings' forms.
 */
export const SETTINGS_SAVE_BUTTON = "rounded-md bg-teal-600 px-3 py-1 text-xs font-medium text-white hover:bg-teal-500 disabled:opacity-50";

const BUTTON_BASE = "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs whitespace-nowrap disabled:opacity-40";

/**
 * ### SETTINGS_BUTTON
 *
 * An outlined button in Settings, such as Test or Replace.
 */
export const SETTINGS_BUTTON = `${BUTTON_BASE} border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800`;

/**
 * ### SETTINGS_PRIMARY_BUTTON
 *
 * The filled button for the one next step on a card, such as Sign in.
 */
export const SETTINGS_PRIMARY_BUTTON = `${BUTTON_BASE} border-teal-600 bg-teal-600 font-medium text-white hover:bg-teal-500`;

/**
 * ### SETTINGS_LIST
 *
 * A bordered list of {@link SETTINGS_ROW} buttons, such as General's.
 */
export const SETTINGS_LIST = "flex flex-col gap-0.5 rounded-lg border border-zinc-200 p-1 dark:border-zinc-800";

/**
 * ### SETTINGS_ROW
 *
 * A full-width button row in a {@link SETTINGS_LIST}: an icon, a label, and a value or arrow at the right.
 */
export const SETTINGS_ROW = "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-zinc-100 dark:hover:bg-zinc-800/70";

/**
 * ### SettingsSection
 *
 * A titled group on a Settings page, with an optional button at the right of its title.
 */
export function SettingsSection({ title, description, action, children }: { title: string; description?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">{title}</h2>
          {description !== undefined && <p className="mt-0.5 text-xs text-zinc-500">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * ### ReadyDot
 *
 * Green when a check passed, amber when it needs setting up. Pair it with
 * {@link ReadyText} for screen readers.
 */
export function ReadyDot({ ready }: { ready: boolean }) {
  return <span aria-hidden className={`mt-1.5 size-2 shrink-0 rounded-full ${ready ? "bg-green-500" : "bg-amber-500"}`} />;
}

/**
 * ### ReadyText
 *
 * What {@link ReadyDot} shows, for screen readers only.
 */
export function ReadyText({ ready }: { ready: boolean }) {
  return <span className="sr-only">{ready ? "ready" : "not set up"}</span>;
}

/**
 * ### CheckCard
 *
 * A card for one thing mothership checks on your Mac, such as the GitHub CLI.
 *
 * @param purpose - What it is used for.
 */
export function CheckCard({ label, purpose, check, children }: { label: string; purpose?: string; check: CheckResult; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex items-start gap-2">
        <ReadyDot ready={check.ready} />
        <div className="min-w-0">
          <p className="text-sm">
            {label} <ReadyText ready={check.ready} />
          </p>
          <p className="break-words text-xs text-zinc-500">{check.detail}</p>
          {purpose !== undefined && <p className="text-[11px] text-zinc-500">{purpose}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

/**
 * ### SaveState
 *
 * A form's save in progress, and the message of the last one.
 */
export type SaveState = { busy: boolean; message: string | undefined; failed: boolean };

/**
 * ### useSave
 *
 * Runs a save that resolves to an error message (or `undefined` on success)
 * and keeps its state for {@link SaveStatus}.
 *
 * @returns The state, `save` to run one, and `fail` to show a problem found before saving.
 */
export function useSave<A extends Array<unknown>>(onSave: (...args: A) => Promise<string | undefined>) {
  const [state, setState] = useState<SaveState>({ busy: false, message: undefined, failed: false });
  async function save(...args: A) {
    setState({ busy: true, message: undefined, failed: false });
    const error = await onSave(...args);
    setState({ busy: false, message: error ?? "Saved", failed: error !== undefined });
  }
  const fail = (message: string | undefined) => setState({ busy: false, message, failed: message !== undefined });
  return { state, save, fail };
}

/**
 * ### SaveStatus
 *
 * "Saved", or why the save failed.
 */
export function SaveStatus({ state }: { state: SaveState }) {
  if (state.message === undefined) return null;
  return (
    <span role="status" className={`text-xs ${state.failed ? "text-red-600 dark:text-red-400" : "text-green-700 dark:text-green-400"}`}>
      {state.message}
    </span>
  );
}
