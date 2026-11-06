"use client";

import { LoaderCircle } from "lucide-react";
import { useState, type ComponentType, type ReactNode } from "react";
import type { ConnectionChip } from "@/features/settings/model/connectionStatus";
import { SETTINGS_BUTTON, SETTINGS_PRIMARY_BUTTON } from "@/features/settings/ui/settingsLayout";
import type { useFileDrop } from "@/features/settings/ui/useFileDrop";
import type { BrandIconProps } from "@/ui/brandIcons";
import { StatusChip } from "@/ui/StatusChip";

/**
 * ### ConnectionShell
 *
 * The frame every card in Settings → Connections shares: the tool's icon,
 * name and status chip, any header controls at the right, one line on what
 * connecting gives you, the body for the card's current state, and the
 * background folded under Details.
 *
 * @param chip - Omitted when the card's rows carry their own chips (KakaoTalk).
 * @param drop - Drag-and-drop handlers for a card that takes a file anywhere on it.
 */
export function ConnectionShell({
  icon: Icon,
  title,
  chip,
  controls,
  description,
  details,
  drop,
  children,
}: {
  icon: ComponentType<BrandIconProps>;
  title: string;
  chip?: ConnectionChip;
  controls?: ReactNode;
  description?: ReactNode;
  details?: ReactNode;
  drop?: ReturnType<typeof useFileDrop>;
  children?: ReactNode;
}) {
  return (
    <section
      className={`flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800 ${drop?.dragging === true ? "outline-2 outline-offset-2 outline-teal-500 outline-dashed" : ""}`}
      {...drop?.handlers}
    >
      <header className="flex flex-wrap items-center gap-2">
        <Icon size={16} aria-hidden />
        <h3 className="text-sm font-medium">{title}</h3>
        {chip !== undefined && <StatusChip tone={chip.tone} label={chip.label} />}
        {controls !== undefined && <span className="ml-auto flex flex-wrap items-center justify-end gap-2">{controls}</span>}
      </header>
      {description !== undefined && <p className="-mt-1 text-xs text-zinc-500">{description}</p>}
      {children}
      {details !== undefined && <Disclosure summary="Details">{details}</Disclosure>}
    </section>
  );
}

/**
 * ### ConnectionRow
 *
 * One capability of a card that has several, each with its own status
 * (KakaoTalk's note to self and reading chats on this Mac).
 */
export function ConnectionRow({ title, chip, children }: { title: string; chip: ConnectionChip; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-xs font-medium">{title}</h4>
        <StatusChip tone={chip.tone} label={chip.label} />
      </div>
      {children}
    </div>
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
 * The `.env.local` variable a value is saved as, for Details.
 */
export function EnvName({ name }: { name: string }) {
  return <code className="font-mono text-[11px]">{name}</code>;
}

/**
 * ### ConnectedRow
 *
 * A working connection's line: who it is connected as, Test, and the card's
 * other buttons (Disconnect, Sign in again).
 *
 * @param result - The latest test's outcome in a few words, e.g. `Connected as Ada · 9 items`.
 * @param testLabel - "Test", or "Check again" after a failure.
 */
export function ConnectedRow({
  result,
  testing,
  testLabel = "Test",
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
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {result !== undefined && (
        <span role="status" className="min-w-0 text-zinc-700 dark:text-zinc-300">
          {result}
        </span>
      )}
      <span className="ml-auto flex flex-wrap items-center gap-1.5">
        {testing && <LoaderCircle size={13} className="animate-spin text-teal-500" aria-label="Testing" />}
        {onTest !== undefined && (
          <button type="button" className={SETTINGS_BUTTON} disabled={testing || testDisabled} onClick={onTest}>
            {testLabel}
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
  if (!confirming) {
    return (
      <button type="button" className={SETTINGS_BUTTON} onClick={() => setConfirming(true)}>
        Disconnect
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
        Disconnect
      </button>
      <button type="button" className={SETTINGS_BUTTON} disabled={busy} onClick={() => setConfirming(false)}>
        Keep
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
  return (
    <div>
      <button type="button" className={SETTINGS_PRIMARY_BUTTON} onClick={onClick}>
        Connect
      </button>
    </div>
  );
}
