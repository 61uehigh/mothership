"use client";

import { RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

/**
 * ### ICON_BUTTON_BASE
 *
 * Colors of a small icon-only button, without padding; for buttons that
 * need a different size than {@link ICON_BUTTON}.
 */
export const ICON_BUTTON_BASE =
  "rounded text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900 disabled:opacity-40 dark:hover:bg-zinc-800 dark:hover:text-zinc-100";

/**
 * ### ICON_BUTTON
 *
 * Classes for a small icon button in a pane header, toolbar, or row.
 */
export const ICON_BUTTON = `${ICON_BUTTON_BASE} p-1`;

/**
 * ### IconButton
 *
 * Icon-only button; `label` is both its accessible name and its tooltip.
 */
export function IconButton({
  label,
  title,
  onClick,
  disabled = false,
  className,
  children,
}: {
  label: string;
  /** Tooltip when it should say more than `label`, e.g. the shortcut. */
  title?: string;
  onClick: () => void;
  disabled?: boolean;
  /** Replaces {@link ICON_BUTTON}. */
  className?: string;
  children: ReactNode;
}) {
  return (
    <button type="button" aria-label={label} title={title ?? label} disabled={disabled} className={className ?? ICON_BUTTON} onClick={onClick}>
      {children}
    </button>
  );
}

/**
 * ### RefreshButton
 *
 * Icon button that reloads something; spins and is disabled while loading.
 */
export function RefreshButton({
  loading,
  onClick,
  label = "Refresh",
  title,
  size = 14,
  className,
}: {
  loading: boolean;
  onClick: () => void;
  label?: string;
  title?: string;
  size?: number;
  className?: string;
}) {
  return (
    <IconButton label={label} title={title} disabled={loading} className={className} onClick={onClick}>
      <RefreshCw size={size} className={loading ? "animate-spin" : undefined} />
    </IconButton>
  );
}

/**
 * ### ROW_ACTION
 *
 * Classes for an icon button shown over a list row on hover, whose
 * background is already the row's hover color.
 */
export const ROW_ACTION =
  "rounded p-1 text-zinc-500 hover:bg-zinc-300/60 hover:text-zinc-900 disabled:opacity-50 dark:hover:bg-zinc-700 dark:hover:text-zinc-100";
