"use client";

import { LoaderCircle } from "lucide-react";
import { useState, type ComponentType, type ReactNode } from "react";
import type { ConnectionChip } from "@/features/settings/model/connectionStatus";
import { SETTINGS_BUTTON, SETTINGS_PRIMARY_BUTTON } from "@/features/settings/ui/settingsLayout";
import { useDeveloperMode } from "@/features/settings/ui/developerMode";
import type { useFileDrop } from "@/features/settings/ui/useFileDrop";
import type { BrandIconProps } from "@/ui/brandIcons";
import { chipLabel } from "@/shell/connectionProblemText";
import { useT } from "@/ui/i18n/useT";
import { StatusChip } from "@/ui/StatusChip";

/**
 * ### ConnectionShell
 *
 * The frame every card in Settings → Connections shares: the tool's icon,
 * name and status chip, any header controls at the right, one line on what
 * connecting gives you, the body for the card's current state, and the
 * background folded under Details.
 *
 * @param chip - Omitted when the card has no status of its own.
 * @param drop - Drag-and-drop handlers for a card that takes a file anywhere on it.
 * @param nested - Drawn as one row of a group card (Google): no frame of its
 *   own, a line above it, and no description line.
 * @param id - The connection's id, so a sidebar can bring this card into view.
 * @param alert - A failure that belongs to the card whatever it shows, e.g. a mode that did not save.
 */
export function ConnectionShell({
  icon: Icon,
  title,
  chip,
  controls,
  description,
  details,
  drop,
  nested = false,
  id,
  alert,
  children,
}: {
  icon: ComponentType<BrandIconProps>;
  title: string;
  chip?: ConnectionChip;
  controls?: ReactNode;
  description?: ReactNode;
  details?: ReactNode;
  drop?: ReturnType<typeof useFileDrop>;
  nested?: boolean;
  id?: string;
  alert?: string;
  children?: ReactNode;
}) {
  const t = useT();
  const frame = nested ? "gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800" : "gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800";
  return (
    <section
      data-connection={id}
      className={`flex flex-col ${frame} ${drop?.dragging === true ? "outline-2 outline-offset-2 outline-teal-500 outline-dashed" : ""}`}
      {...drop?.handlers}
    >
      <header className="flex flex-wrap items-center gap-2">
        <Icon size={16} aria-hidden />
        <h3 className="text-sm font-medium">{title}</h3>
        {chip !== undefined && <StatusChip tone={chip.tone} label={chipLabel(t, chip.state)} />}
        {controls !== undefined && <span className="ml-auto flex flex-wrap items-center justify-end gap-2">{controls}</span>}
      </header>
      {description !== undefined && !nested && <p className="-mt-1 text-xs text-zinc-500">{description}</p>}
      {children}
      {alert !== undefined && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {alert}
        </p>
      )}
      {details !== undefined && <Disclosure summary={t("ui.details")}>{details}</Disclosure>}
    </section>
  );
}

/**
 * ### Disclosure
 *
 * Background folded behind a small summary line, such as "Details".
 */
export function Disclosure({ summary, open, children }: { summary: string; open?: boolean; children: ReactNode }) {
  return (
    <details open={open} className="text-xs text-zinc-500">
      <summary className="w-fit cursor-pointer select-none hover:text-zinc-800 dark:hover:text-zinc-200">{summary}</summary>
      <div className="mt-2 flex flex-col gap-2 leading-relaxed">{children}</div>
    </details>
  );
}

/**
 * ### DetailRow
 *
 * One labelled fact under Details, such as the variable a key is saved as.
 */
export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="w-28 shrink-0 text-zinc-500">{label}</span>
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-zinc-700 dark:text-zinc-300">{children}</span>
    </div>
  );
}

/**
 * ### EnvName
 *
 * The `.env.local` variable a value is saved as, for Details; shown only in
 * developer mode.
 */
export function EnvName({ name }: { name: string }) {
  const developer = useDeveloperMode();
  return developer ? <code className="font-mono text-[11px]">{name}</code> : null;
}

/**
 * ### ConnectedRow
 *
 * A working connection's line: who it is connected as, Test, and the card's
 * other buttons (Disconnect, Sign in again).
 *
 * @param result - The latest test's outcome in a few words, e.g. `Connected as Ada · 9 items`.
 * @param testLabel - "Test" (the default), or "Check again" after a failure.
 */
export function ConnectedRow({
  result,
  testing,
  testLabel,
  testDisabled = false,
  onTest,
  children,
}: {
  result?: ReactNode;
  testing: boolean;
  testLabel?: string;
  testDisabled?: boolean;
  onTest?: () => void;
  children?: ReactNode;
}) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {result !== undefined && (
        <span role="status" className="min-w-0 text-zinc-700 dark:text-zinc-300">
          {result}
        </span>
      )}
      <span className="ml-auto flex flex-wrap items-center gap-1.5">
        {testing && <LoaderCircle size={13} className="animate-spin text-teal-500" aria-label={t("settings.testing")} />}
        {onTest !== undefined && (
          <button type="button" className={SETTINGS_BUTTON} disabled={testing || testDisabled} onClick={onTest}>
            {testLabel ?? t("settings.test")}
          </button>
        )}
        {children}
      </span>
    </div>
  );
}

/**
 * ### DisconnectButton
 *
 * Disconnect, asking once more before it removes the key or sign-in.
 *
 * @param onDisconnect - Removes it; resolves once done.
 */
export function DisconnectButton({ onDisconnect }: { onDisconnect: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const t = useT();
  if (!confirming) {
    return (
      <button type="button" className={SETTINGS_BUTTON} onClick={() => setConfirming(true)}>
        {t("settings.disconnect")}
      </button>
    );
  }
  return (
    <>
      <button
        type="button"
        className={`${SETTINGS_BUTTON} border-red-300 text-red-700 dark:border-red-900 dark:text-red-400`}
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void onDisconnect().finally(() => {
            setBusy(false);
            setConfirming(false);
          });
        }}
      >
        {t("settings.disconnect")}
      </button>
      <button type="button" className={SETTINGS_BUTTON} disabled={busy} onClick={() => setConfirming(false)}>
        {t("settings.keep")}
      </button>
    </>
  );
}

/**
 * ### ConnectButton
 *
 * The one next step on a card that is not set up: opens its checklist.
 */
export function ConnectButton({ onClick }: { onClick: () => void }) {
  const t = useT();
  return (
    <div>
      <button type="button" className={SETTINGS_PRIMARY_BUTTON} onClick={onClick}>
        {t("settings.connect")}
      </button>
    </div>
  );
}
