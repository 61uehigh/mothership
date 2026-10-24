"use client";

import { Check, ChevronRight, LoaderCircle, X } from "lucide-react";
import { useState } from "react";
import { describeTool } from "@/features/sessions/ui/toolCalls";
import type { ToolResult } from "@/features/sessions/model/AgentEvents";

/**
 * ### ToolUse
 *
 * One tool call in a session, with its result once known.
 */
export type ToolUse = { key: string; name: string; detail: string; result: ToolResult | undefined };

/** How many calls in a row are shown before the run is folded into a summary. */
const FOLD_AFTER = 3;

function Diff({ before, after }: { before: string; after: string }) {
  return (
    <pre className="overflow-x-auto rounded border border-zinc-200 text-[11px] leading-snug dark:border-zinc-800">
      {before.split("\n").map((line, i) => (
        <div key={`-${i}`} className="bg-red-50 px-2 text-red-800 dark:bg-red-950/40 dark:text-red-300">
          − {line}
        </div>
      ))}
      {after.split("\n").map((line, i) => (
        <div key={`+${i}`} className="bg-green-50 px-2 text-green-800 dark:bg-green-950/40 dark:text-green-300">
          + {line}
        </div>
      ))}
    </pre>
  );
}

/**
 * ### ToolCard
 *
 * One readable tool call: an icon, what was done to what, and whether it
 * worked. Click to see the input (a diff for edits) and what the tool returned.
 *
 * @param running - Whether the turn is still going, so a call without a result shows as in progress.
 */
export function ToolCard({ use, workingDirectory, running }: { use: ToolUse; workingDirectory: string; running: boolean }) {
  const [open, setOpen] = useState(false);
  const call = describeTool(use.name, use.detail, workingDirectory);
  const Icon = call.icon;
  const hasMore = call.diff !== undefined || call.input !== undefined || (use.result !== undefined && use.result.output !== "");

  return (
    <div className="text-xs">
      <button
        type="button"
        aria-expanded={hasMore ? open : undefined}
        disabled={!hasMore}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full min-w-0 items-center gap-1.5 rounded px-1.5 py-1 text-left text-zinc-600 hover:bg-zinc-100 disabled:hover:bg-transparent dark:text-zinc-400 dark:hover:bg-zinc-800/70"
      >
        <ChevronRight size={12} className={`shrink-0 transition-transform ${hasMore ? "" : "invisible"} ${open ? "rotate-90" : ""}`} aria-hidden />
        <Icon size={13} className="shrink-0 text-zinc-500" aria-hidden />
        <span className="shrink-0 font-medium text-zinc-800 dark:text-zinc-200">{call.verb}</span>
        {call.target !== "" && <span className={`min-w-0 truncate ${call.code ? "font-mono text-[11px]" : ""}`}>{call.target}</span>}
        {call.note !== undefined && <span className="shrink-0 text-zinc-500">{call.note}</span>}
        <span className="ml-auto shrink-0">
          {use.result === undefined ? (
            running ? (
              <LoaderCircle size={12} className="animate-spin text-teal-500" aria-label="Running" />
            ) : undefined
          ) : use.result.failed ? (
            <X size={12} className="text-red-500" aria-label="Failed" />
          ) : (
            <Check size={12} className="text-green-600 dark:text-green-400" aria-label="Done" />
          )}
        </span>
      </button>
      {open && (
        <div className="mt-1 mb-2 ml-6 flex flex-col gap-1.5">
          {call.diff !== undefined && <Diff before={call.diff.before} after={call.diff.after} />}
          {call.input !== undefined && (
            <pre className="max-h-48 overflow-auto rounded border border-zinc-200 p-2 text-[11px] whitespace-pre-wrap break-words dark:border-zinc-800">{call.input}</pre>
          )}
          {use.result !== undefined && use.result.output !== "" && (
            <pre
              className={`max-h-64 overflow-auto rounded p-2 text-[11px] whitespace-pre-wrap break-words ${
                use.result.failed ? "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300" : "bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
              }`}
            >
              {use.result.output}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * ### ToolRun
 *
 * Consecutive tool calls between two messages. Up to three show as cards; a
 * longer run folds into "Used 7 tools: Read ×4, Edit ×2, Run" with its latest
 * call still visible, so the conversation stays readable.
 */
export function ToolRun({ uses, workingDirectory, running }: { uses: Array<ToolUse>; workingDirectory: string; running: boolean }) {
  const [expanded, setExpanded] = useState(false);
  if (uses.length <= FOLD_AFTER || expanded) {
    return (
      <div className="flex flex-col">
        {uses.map((use) => (
          <ToolCard key={use.key} use={use} workingDirectory={workingDirectory} running={running} />
        ))}
        {expanded && (
          <button type="button" className="self-start px-1.5 text-[11px] text-zinc-500 hover:underline" onClick={() => setExpanded(false)}>
            Fold
          </button>
        )}
      </div>
    );
  }
  const counts = new Map<string, number>();
  for (const use of uses) {
    const verb = describeTool(use.name, use.detail, workingDirectory).verb;
    counts.set(verb, (counts.get(verb) ?? 0) + 1);
  }
  const summary = [...counts].map(([verb, n]) => (n > 1 ? `${verb} ×${n}` : verb)).join(", ");
  const failed = uses.filter((u) => u.result?.failed === true).length;
  return (
    <div className="flex flex-col">
      <button
        type="button"
        className="flex items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800/70"
        onClick={() => setExpanded(true)}
      >
        <ChevronRight size={12} className="shrink-0" aria-hidden />
        <span className="shrink-0 font-medium text-zinc-700 dark:text-zinc-300">Used {uses.length} tools</span>
        <span className="min-w-0 truncate">{summary}</span>
        {failed > 0 && <span className="shrink-0 text-red-500">{failed} failed</span>}
      </button>
      <ToolCard use={uses[uses.length - 1]} workingDirectory={workingDirectory} running={running} />
    </div>
  );
}
