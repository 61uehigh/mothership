"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { RefreshButton } from "@/ui/IconButton";
import { useText } from "@/ui/useJson";

const FOLLOW_MS = 3_000;
const TAIL_SIZES = [100, 300, 1000] as const;
/** Within this many pixels of the end counts as "at the bottom". */
const BOTTOM_SLACK_PX = 24;

/**
 * ### LogsViewer
 *
 * Recent stdout and stderr of a container in a monospace view that sticks to
 * the bottom. "Follow" refetches every 3 seconds; the tail size and a manual
 * refresh are in the toolbar.
 */
export function LogsViewer({ containerId }: { containerId: string }) {
  const [tail, setTail] = useState<(typeof TAIL_SIZES)[number]>(300);
  const [follow, setFollow] = useState(false);
  // The previous tail stays on screen while a longer or shorter one loads.
  const { data, error, loading, reload } = useText(`/api/docker/containers/${encodeURIComponent(containerId)}/logs?tail=${tail}`, {
    pollMs: follow ? FOLLOW_MS : undefined,
    keepPrevious: true,
  });
  const scroller = useRef<HTMLPreElement>(null);
  const atBottom = useRef(true);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el !== null && (follow || atBottom.current)) el.scrollTop = el.scrollHeight;
  }, [data, follow]);

  function onScroll() {
    const el = scroller.current;
    if (el !== null) atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_SLACK_PX;
  }

  let content: string;
  if (error !== undefined) content = error;
  else if (data === undefined) content = "Loading logs…";
  else content = data === "" ? "No log output." : data;

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-zinc-200 px-4 py-1.5 text-xs dark:border-zinc-800">
        <h3 className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Logs</h3>
        <span className="ml-auto" />
        <label className="flex items-center gap-1 text-zinc-600 dark:text-zinc-400">
          <input type="checkbox" className="accent-teal-600" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
          Follow
        </label>
        <select
          aria-label="Lines to show"
          className="rounded-md border border-zinc-300 bg-transparent px-1.5 py-0.5 text-xs dark:border-zinc-700 dark:bg-zinc-900"
          value={tail}
          onChange={(e) => setTail(TAIL_SIZES.find((size) => String(size) === e.target.value) ?? 300)}
        >
          {TAIL_SIZES.map((size) => (
            <option key={size} value={size}>
              Last {size} lines
            </option>
          ))}
        </select>
        <RefreshButton loading={loading} onClick={reload} label="Refresh logs" size={13} />
      </div>
      <pre
        ref={scroller}
        onScroll={onScroll}
        className={`min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-all bg-zinc-50 px-4 py-2 font-mono text-[11px] leading-relaxed dark:bg-zinc-950 ${
          error !== undefined ? "text-red-600 dark:text-red-400" : "text-zinc-800 dark:text-zinc-200"
        }`}
      >
        {content}
      </pre>
    </section>
  );
}
