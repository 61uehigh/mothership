"use client";

import { ExternalLink, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { SECONDARY_BUTTON } from "@/ui/button";
import { CopyButton } from "@/ui/CopyButton";
import { useT } from "@/ui/i18n/useT";

/**
 * ### FRAME_BUTTON
 *
 * Classes of an outlined button in a {@link TabFrame} header.
 */
export const FRAME_BUTTON = SECONDARY_BUTTON;

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
 * ### LoadError
 *
 * A failed load's message: its first line as the error, and anything after
 * it (such as the raw answer a parser could not read) behind Details.
 */
export function LoadError({ message }: { message: string }) {
  const t = useT();
  const newline = message.indexOf("\n");
  const summary = newline === -1 ? message : message.slice(0, newline);
  const detail = newline === -1 ? "" : message.slice(newline + 1).trim();
  return (
    <div className="flex w-full min-w-0 flex-col gap-1.5">
      <p className="break-words text-red-700 dark:text-red-300">{summary}</p>
      {detail !== "" && (
        <details className="text-xs text-zinc-500">
          <summary className="w-fit cursor-pointer select-none hover:text-zinc-800 dark:hover:text-zinc-200">{t("ui.details")}</summary>
          <div className="relative mt-1.5">
            <pre className="max-h-48 overflow-auto rounded-md border border-zinc-200 bg-white p-2 pr-10 font-mono text-[11px] break-words whitespace-pre-wrap text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
              {detail}
            </pre>
            <CopyButton text={detail} what={t("ui.error")} className="absolute top-1.5 right-1.5" />
          </div>
        </details>
      )}
    </div>
  );
}

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
  const t = useT();
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <article className="mx-auto flex max-w-4xl flex-col gap-4 px-6 py-6">
        <header className="flex flex-col gap-2.5 border-b border-zinc-200 pb-4 dark:border-zinc-800">
          <h1 className="text-lg font-semibold break-words text-zinc-900 dark:text-zinc-100">{title}</h1>
          <div className="flex flex-wrap items-center gap-1.5">
            {chips}
            <span className="ml-auto flex flex-wrap items-center gap-1.5">
              <button type="button" className={FRAME_BUTTON} disabled={state.loading} onClick={state.reload} aria-label={t("frame.reload")} title={t("frame.reload")}>
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
            <LoadError message={state.error} />
            <button type="button" className={FRAME_BUTTON} disabled={state.loading} onClick={state.reload}>
              {t("ui.retry")}
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
