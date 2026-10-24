"use client";

import { Bot } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { errorMessage, relativeTime } from "@/ui/format";
import { SETTINGS_CHANGED_EVENT } from "@/shell/events";
import { ICON_BUTTON, RefreshButton } from "@/ui/IconButton";
import { useWorkbench } from "@/shell/WorkbenchContext";
import type { DashboardItem, ItemTone, ToolKind, WidgetInfo, WidgetResult } from "@/features/tools/model/Dashboard";

/**
 * ### TONE_CLASSES
 *
 * Badge colours per {@link ItemTone}, for light and dark themes.
 */
export const TONE_CLASSES: Record<ItemTone, string> = {
  neutral: "bg-zinc-200/70 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  info: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  success: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
  warning: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  danger: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
};

/**
 * ### ToolWidget
 *
 * State of the dashboard widget behind a tool pane.
 */
export type ToolWidget = {
  /** The widget, or `undefined` while the widget list loads or when none has this kind. */
  info: WidgetInfo | undefined;
  /** `undefined` until the first load finishes; kept while a refresh runs. */
  result: WidgetResult | undefined;
  loading: boolean;
  /** Reloads, bypassing the server cache. */
  refresh: () => void;
};

function failure(error: unknown): WidgetResult {
  return { status: "error", message: errorMessage(error), fetchedAt: Date.now() };
}

const DEFAULT_REFRESH_SECONDS = 120;

/**
 * ### useToolWidget
 *
 * Loads the first dashboard widget of `kind` through `GET /api/dashboard`
 * and `GET /api/dashboard/:id`, so renaming widgets in `config/dashboard.yaml`
 * keeps working. A missing widget becomes an `unavailable` result.
 *
 * @returns The widget's state and a refresh action.
 */
export function useToolWidget(kind: ToolKind): ToolWidget {
  const [info, setInfo] = useState<WidgetInfo | undefined>(undefined);
  const [result, setResult] = useState<WidgetResult | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  /** Which load is the latest: an older one that finishes later must not overwrite it. */
  const seq = useRef(0);
  /** How often to load again (from `refreshSeconds`); the server's cache keeps this cheap. */
  const every = useRef(DEFAULT_REFRESH_SECONDS);

  const load = useCallback(async (refresh: boolean) => {
    const mine = ++seq.current;
    const latest = () => mine === seq.current;
    setLoading(true);
    try {
      const listResponse = await fetch("/api/dashboard");
      if (!listResponse.ok) throw new Error(`Couldn't read config/dashboard.yaml (${listResponse.status})`);
      // Trusted: produced by our own /api/dashboard route.
      const { widgets, refreshSeconds } = (await listResponse.json()) as { widgets: Array<WidgetInfo>; refreshSeconds: number };
      every.current = refreshSeconds;
      const widget = widgets.find((w) => w.kind === kind);
      if (!latest()) return;
      setInfo(widget);
      if (widget === undefined) {
        setResult({ status: "unavailable", reason: `Add a ${kind} widget to config/dashboard.yaml.`, fetchedAt: Date.now() });
        return;
      }
      const response = await fetch(`/api/dashboard/${encodeURIComponent(widget.id)}${refresh ? "?refresh=1" : ""}`);
      if (!response.ok) throw new Error(`Couldn't load ${widget.title} (${response.status})`);
      // Trusted: produced by our own /api/dashboard/[id] route.
      const fresh = (await response.json()) as WidgetResult;
      if (latest()) setResult(fresh);
    } catch (error) {
      if (latest()) setResult(failure(error));
    } finally {
      if (latest()) setLoading(false);
    }
  }, [kind]);

  useEffect(() => {
    // Deferred a tick: `load` sets state, which must not happen synchronously in an effect.
    const timer = setTimeout(() => void load(false), 0);
    const onSettings = () => void load(false);
    window.addEventListener(SETTINGS_CHANGED_EVENT, onSettings);
    // Keep "Now", "Next", and "today" current through the day; skipped while the window is hidden.
    let poll: ReturnType<typeof setTimeout>;
    const schedule = () => {
      poll = setTimeout(() => {
        if (document.visibilityState === "visible") void load(false);
        schedule();
      }, every.current * 1000);
    };
    schedule();
    return () => {
      clearTimeout(timer);
      clearTimeout(poll);
      window.removeEventListener(SETTINGS_CHANGED_EVENT, onSettings);
    };
  }, [load]);

  return { info, result, loading, refresh: () => void load(true) };
}

/**
 * ### WidgetRefreshButton
 *
 * Header icon button that reloads a tool pane; spins while loading.
 */
export function WidgetRefreshButton({
  loading,
  onClick,
  label,
  result,
  now = 0,
}: {
  loading: boolean;
  onClick: () => void;
  label: string;
  /** When given, how long ago it loaded is shown beside the button, and the source's note is in the tooltip. */
  result?: WidgetResult;
  /** Current time for the age; 0 hides it. */
  now?: number;
}) {
  const fetched = result?.status === "ok" ? result : undefined;
  const title = [label, fetched?.note].filter(Boolean).join("\n");
  return (
    <>
      {fetched !== undefined && now > 0 && (
        <span className="shrink-0 text-[10px] font-normal tracking-normal normal-case" title={fetched.note}>
          {relativeTime(fetched.fetchedAt, now)}
        </span>
      )}
      <RefreshButton loading={loading} onClick={onClick} label={label} title={title} />
    </>
  );
}

/**
 * ### WidgetStatus
 *
 * Placeholder for a pane's body: loading skeleton, setup hint, error with
 * retry, or empty message. Renders nothing once items are available.
 */
export function WidgetStatus({
  widget,
  empty,
  itemCount,
}: {
  widget: ToolWidget;
  /** Shown when the widget loaded with no items. */
  empty: string;
  itemCount: number;
}) {
  const { result } = widget;
  const workbench = useWorkbench();
  if (result === undefined) {
    return (
      <ul className="flex flex-col gap-2 px-2 py-2" aria-hidden>
        {[0, 1, 2, 3].map((n) => (
          <li key={n} className="h-9 animate-pulse rounded bg-zinc-200/70 dark:bg-zinc-800" />
        ))}
      </ul>
    );
  }
  if (result.status === "unavailable") {
    return (
      <div className="flex flex-col gap-1 px-3 py-3 text-xs">
        <p className="font-medium text-zinc-700 dark:text-zinc-300">Not connected</p>
        <p className="break-words text-zinc-500">{result.reason}</p>
        <button
          type="button"
          onClick={() => workbench.open({ kind: "settings" })}
          className="self-start rounded border border-zinc-300 px-1.5 py-0.5 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Set up in Settings
        </button>
      </div>
    );
  }
  if (result.status === "error") {
    return (
      <div className="flex flex-col items-start gap-2 px-3 py-3 text-xs">
        <p className="break-words text-red-600 dark:text-red-400">{result.message}</p>
        <button
          type="button"
          disabled={widget.loading}
          onClick={widget.refresh}
          className="rounded border border-zinc-300 px-1.5 py-0.5 text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Retry
        </button>
      </div>
    );
  }
  return itemCount === 0 ? <p className="px-3 py-4 text-xs text-zinc-500">{empty}</p> : undefined;
}

/**
 * ### ToolRow
 *
 * One compact item row: badge, title, meta, subtitle, relative time, and a
 * "Hand off" icon button that appears on hover or keyboard focus.
 */
export function ToolRow({
  item,
  now,
  selected = false,
  onOpen,
  onPin,
  onHandOff,
  children,
}: {
  item: DashboardItem;
  /** Current time for relative times; 0 hides them. */
  now: number;
  selected?: boolean;
  /** Single click. */
  onOpen: () => void;
  /** Double click, e.g. to pin a preview tab. */
  onPin?: () => void;
  onHandOff: (() => void) | undefined;
  /** Extra content under the row, outside the main button (e.g. a join link). */
  children?: ReactNode;
}) {
  return (
    <li className="group relative">
      <button
        type="button"
        onClick={onOpen}
        onDoubleClick={onPin}
        title={item.title}
        className={`flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left ${onHandOff === undefined ? "" : "pr-8"} ${
          selected ? "bg-teal-100/70 dark:bg-teal-900/40" : "hover:bg-zinc-200/60 dark:hover:bg-zinc-800/70"
        } ${item.muted ? "opacity-50" : ""}`}
      >
        {item.highlighted && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded bg-teal-500" aria-hidden />}
        <span className="flex w-full items-baseline gap-1.5">
          {item.badge !== undefined && (
            <span className={`shrink-0 rounded px-1 text-[10px] font-medium leading-4 ${TONE_CLASSES[item.badge.tone]}`}>
              {item.badge.label}
            </span>
          )}
          <span className="min-w-0 flex-1 truncate text-[13px]">{item.title}</span>
          {item.meta !== undefined && <span className="shrink-0 font-mono text-[10px] text-zinc-500">{item.meta}</span>}
        </span>
        <span className="flex w-full items-baseline gap-2 text-[11px] text-zinc-500">
          <span className="min-w-0 flex-1 truncate">{item.subtitle}</span>
          {item.at !== undefined && now > 0 && <span className="shrink-0 text-[10px]">{relativeTime(item.at, now)}</span>}
        </span>
      </button>
      {children}
      {onHandOff !== undefined && (
        <button
          type="button"
          aria-label={`Hand off "${item.title}" to an agent`}
          title="Hand off to an agent"
          onClick={onHandOff}
          className={`absolute top-1 right-1 hidden bg-zinc-200 group-focus-within:block group-hover:block dark:bg-zinc-800 ${ICON_BUTTON} hover:bg-zinc-300 dark:hover:bg-zinc-700`}
        >
          <Bot size={14} />
        </button>
      )}
    </li>
  );
}

