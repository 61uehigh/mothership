"use client";

import { useEffect } from "react";
import { useShell } from "@/shell/ShellContext";
import { AgentGraph } from "@/features/sessions/ui/graph/AgentGraph";
import { useJson } from "@/ui/useJson";
import { useNow } from "@/ui/useNow";
import { useWorkbench } from "@/shell/WorkbenchContext";
import type { NativeSubagent } from "@/features/sessions/model/Subagents";

/** Live sub-agent steps come fast; one refetch per burst is enough. */
const REFETCH_DELAY_MS = 600;

const CLOCK_TICK_MS = 30_000;

/**
 * ### GraphTab
 *
 * Every agent as a spawn tree with conversation lines, including the
 * sub-agents a provider ran on its own (Claude's Agent tool), which update
 * live; clicking a card opens its session.
 */
export function GraphTab() {
  const { agents, messages, questions, subscribe } = useShell();
  const native = useJson<{ subagents: Record<string, Array<NativeSubagent>> }>("/api/agents/subagents", { keepPrevious: true });
  const { reload } = native;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = subscribe((update) => {
      // A sub-agent started, progressed, or finished, or a turn ended (which settles running ones).
      const relevant =
        (update.type === "event" && update.record.event.type === "subagent") || (update.type === "agent" && update.agent.status !== "running");
      if (!relevant) return;
      clearTimeout(timer);
      timer = setTimeout(reload, REFETCH_DELAY_MS);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [subscribe, reload]);
  const workbench = useWorkbench();
  const now = useNow(CLOCK_TICK_MS);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        {agents.length === 0 ? (
          <p className="p-6 text-sm text-zinc-500">No agents yet.</p>
        ) : (
          <AgentGraph
            agents={agents}
            messages={messages}
            questions={questions}
            now={now}
            native={native.data?.subagents}
            onSelect={(id) => workbench.open({ kind: "session", agentId: id })}
          />
        )}
      </div>
      <footer className="flex flex-wrap gap-x-5 border-t border-zinc-200 px-4 py-1.5 text-[11px] text-zinc-500 dark:border-zinc-800">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-6 bg-violet-400" /> Conversation
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-6 border-t border-dashed border-zinc-400" />▸ Spawned (creator → created)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded-sm border border-dashed border-l-2 border-zinc-400 border-l-orange-300" /> Claude sub-agent (read-only)
        </span>
      </footer>
    </div>
  );
}
