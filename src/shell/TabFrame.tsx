"use client";

import { ExternalLink, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

/**
 * ### FRAME_BUTTON
 *
 * Classes of an outlined button in a {@link TabFrame} header.
 */
export const FRAME_BUTTON =
  "inline-flex items-center gap-1.5 rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800";

/**
 * ### Chip
 *
 * Small metadata label in a tab header.
 */
export function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] leading-4 ${className ?? "bg-zinc-200/70 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"}`}>
      {children}
    </span>
  );
}

/**
 * ### TabFrameState
 *
 * What {@link TabFrame} needs to know about the load behind it; a
 * `Fetched` from `useJson` fits as is.
 */
export type TabFrameState = {
  /** `undefined` until the first load; the body renders once it is set. */
  data: unknown;
  error: string | undefined;
  loading: boolean;
  reload: () => void;
};

/**
 * ### TabFrame
 *
 * Layout of a center tab that shows one document: a header with title,
 * metadata chips, a reload button, an optional "open in the app" link, and
 * further actions, then a scrolling body. Shows a skeleton until the first
 * load and an error with retry when loading fails.
 */
export function TabFrame({
  title,
  chips,
  open,
  actions,
  state,
  children,
}: {
  title: string;
  chips: ReactNode;
  /** Link to the same thing in its own app, e.g. "Open in Nuclino". */
  open?: { label: string; url: string | undefined };
  /** More header buttons, after the reload button and the link. */
  actions?: ReactNode;
  state: TabFrameState;
  children: ReactNode;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <article className="mx-auto flex max-w-4xl flex-col gap-4 px-6 py-6">
        <header className="flex flex-col gap-2.5 border-b border-zinc-200 pb-4 dark:border-zinc-800">
          <h1 className="text-xl font-semibold break-words text-zinc-900 dark:text-zinc-100">{title}</h1>
          <div className="flex flex-wrap items-center gap-1.5">
            {chips}
            <span className="ml-auto flex flex-wrap items-center gap-1.5">
              <button type="button" className={FRAME_BUTTON} disabled={state.loading} onClick={state.reload} aria-label="Reload" title="Reload">
                <RefreshCw size={12} className={state.loading ? "animate-spin" : undefined} />
              </button>
              {open?.url !== undefined && (
                <a href={open.url} target="_blank" rel="noopener noreferrer" className={FRAME_BUTTON}>
                  <ExternalLink size={12} aria-hidden />
                  {open.label}
                </a>
              )}
              {actions}
            </span>
          </div>
        </header>
        {state.error !== undefined && (
          <div className="flex flex-col items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900/60 dark:bg-red-950/40">
            <p className="break-words text-red-700 dark:text-red-300">{state.error}</p>
            <button type="button" className={FRAME_BUTTON} disabled={state.loading} onClick={state.reload}>
              Retry
            </button>
          </div>
        )}
        {state.data === undefined && state.error === undefined && (
          <div className="flex flex-col gap-2.5" aria-hidden>
            {["w-3/4", "w-full", "w-5/6", "w-2/3", "w-full", "w-1/2"].map((width, n) => (
              <div key={n} className={`h-4 animate-pulse rounded bg-zinc-200/70 dark:bg-zinc-800 ${width}`} />
            ))}
          </div>
        )}
        {state.data !== undefined && children}
      </article>
    </div>
  );
}
