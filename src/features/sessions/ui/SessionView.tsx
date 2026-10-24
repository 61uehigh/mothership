"use client";

import { GitBranch, Network, Square, FileDiff } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useShell } from "@/shell/ShellContext";
import { StatusLabel } from "@/features/sessions/ui/StatusLabel";
import { ToolRun, type ToolUse } from "@/features/sessions/ui/ToolCard";
import { leadOf, nativeSubagents, teamOf } from "@/features/sessions/ui/team";
import { useCommands, type Command } from "@/shell/commands/CommandProvider";
import { formatBinding } from "@/shell/commands/keys";
import { QuestionCard } from "@/features/sessions/ui/questions/QuestionCard";
import { openIn } from "@/features/sessions/ui/openIn";
import { useNow } from "@/ui/useNow";
import { useWorkbench } from "@/shell/WorkbenchContext";
import type { Agent, AgentEventRecord, AgentMessage } from "@/features/sessions/model/Agent";
import type { ToolResult } from "@/features/sessions/model/AgentEvents";
import { fetchJson } from "@/ui/useJson";

const CLOCK_TICK_MS = 30_000;

type Item = { kind: "message"; at: number; message: AgentMessage } | { kind: "event"; at: number; record: AgentEventRecord };
type Shown = Item | { kind: "tools"; key: string; uses: Array<ToolUse> };

/**
 * Folds consecutive tool calls into one run and pairs each call with its
 * result. Results and sub-agent steps are not shown on their own (they appear
 * in the call's card and the team tree), so they do not break a run.
 */
function withToolRuns(items: Array<Item>): Array<Shown> {
  const results = new Map<string, ToolResult>();
  for (const item of items) {
    if (item.kind === "event" && item.record.event.type === "tool_result") {
      const { id, output, failed } = item.record.event;
      results.set(id, { output, failed });
    }
  }
  const shown: Array<Shown> = [];
  let run: Array<ToolUse> = [];
  const flush = () => {
    if (run.length > 0) shown.push({ kind: "tools", key: `t-${run[0].key}`, uses: run });
    run = [];
  };
  for (const item of items) {
    if (item.kind === "event") {
      const { event } = item.record;
      if (event.type === "tool") {
        run.push({
          key: String(item.record.id),
          name: event.name,
          detail: event.detail,
          result: event.result ?? (event.id === undefined ? undefined : results.get(event.id)),
        });
        continue;
      }
      if (event.type === "tool_result" || (event.type === "subagent" && event.phase === "step")) continue;
    }
    flush();
    shown.push(item);
  }
  flush();
  return shown;
}

function upsertMessage(list: Array<AgentMessage>, message: AgentMessage): Array<AgentMessage> {
  return list.some((m) => m.id === message.id) ? list.map((m) => (m.id === message.id ? message : m)) : [...list, message];
}

function EventRow({ record }: { record: AgentEventRecord }) {
  const { event } = record;
  switch (event.type) {
    case "text":
      return <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">{event.text}</div>;
    case "tool":
    case "tool_result":
      // Shown as tool cards (see withToolRuns).
      return undefined;
    case "done":
      return (
        <div className="text-[11px] text-green-600 dark:text-green-400">
          ✓ Turn complete{event.costUsd === undefined ? "" : ` · $${event.costUsd.toFixed(4)}`}
        </div>
      );
    case "error":
      return <div className="break-words text-sm text-red-600 dark:text-red-400">✗ {event.message}</div>;
    case "subagent":
      // Steps show in the team tree; the conversation keeps only the start and end.
      if (event.phase === "step") return undefined;
      return (
        <div className="text-[11px] text-zinc-500">
          {event.phase === "start"
            ? `↳ Claude sub-agent started: ${event.description} (${event.kind})`
            : event.failed
              ? "↳ Claude sub-agent failed"
              : "↳ Claude sub-agent finished; its report is in the agent graph"}
        </div>
      );
  }
}

/**
 * ### SessionView
 *
 * The center tab for one agent session, styled after Claude Code: the
 * conversation (messages, tool calls, results), open questions inline, and a
 * composer. Session details live in the foldable details column beside it
 * (`SessionInfo`).
 */
export function SessionView({ agent }: { agent: Agent }) {
  const { agents, questions, subscribe, connected } = useShell();
  const workbench = useWorkbench();
  const now = useNow(CLOCK_TICK_MS);
  const [messages, setMessages] = useState<Array<AgentMessage>>([]);
  const [events, setEvents] = useState<Array<AgentEventRecord>>([]);
  const [draft, setDraft] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  /** Bumped by Retry to load again. */
  const [attempt, setAttempt] = useState(0);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const agentsById = new Map(agents.map((a) => [a.id, a]));
  const open = questions.filter((q) => q.agentId === agent.id && q.status === "open");

  useEffect(() => {
    let cancelled = false;
    // Subscribe before loading so nothing between the fetch and the subscription is lost.
    const unsubscribe = subscribe((update) => {
      if (update.type === "message" && update.message.agentId === agent.id) {
        setMessages((list) => upsertMessage(list, update.message));
      }
      if (update.type === "event" && update.record.agentId === agent.id) {
        setEvents((list) => (list.some((r) => r.id === update.record.id) ? list : [...list, update.record]));
      }
    });
    // Loaded again whenever the live connection comes back: updates sent while it was down never arrived.
    if (!connected && loaded) return () => unsubscribe();
    void (async () => {
      const result = await fetchJson<{ messages: Array<AgentMessage>; events: Array<AgentEventRecord> }>(`/api/agents/${agent.id}`);
      if (cancelled) return;
      if (!result.ok) {
        setLoadError(result.error);
        return;
      }
      const data = result.data;
      setLoadError(undefined);
      setMessages((live) => data.messages.reduce(upsertMessage, live));
      setEvents((live) => {
        const known = new Set(data.events.map((r) => r.id));
        return [...data.events, ...live.filter((r) => !known.has(r.id))];
      });
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
      unsubscribe();
    };
    // `loaded` is read only to skip a pointless load while disconnected; it must not retrigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent.id, subscribe, connected, attempt]);

  const items: Array<Item> = [
    ...messages.map((message): Item => ({ kind: "message", at: message.deliveredAt ?? Infinity, message })),
    ...events.map((record): Item => ({ kind: "event", at: record.createdAt, record })),
  ].sort((a, b) => a.at - b.at);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [items.length]);

  async function send() {
    const text = draft.trim();
    if (text === "") return;
    setSending(true);
    try {
      const response = await fetch(`/api/agents/${agent.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (response.ok) setDraft("");
    } finally {
      setSending(false);
    }
  }

  // Commands read the latest render through this ref so they register once.
  const latest = useRef(agent);
  useEffect(() => {
    latest.current = agent;
  });
  const commands = useMemo<Array<Command>>(
    () => [
      { id: "session-reply", title: "Write to this session", group: "Session", keys: ["r"], run: () => composerRef.current?.focus() },
      {
        id: "session-stop",
        title: "Stop the running turn",
        group: "Session",
        keys: ["mod+."],
        run: () => {
          if (latest.current.status !== "running") return false;
          void fetch(`/api/agents/${latest.current.id}/stop`, { method: "POST" });
        },
      },
      { id: "session-terminal", title: "Open the session folder in Terminal", group: "Session", keys: ["t"], run: () => openIn(latest.current.id, "terminal") },
      { id: "session-editor", title: "Open the session folder in VS Code", group: "Session", keys: ["e"], run: () => openIn(latest.current.id, "vscode") },
    ],
    [],
  );
  useCommands(commands);

  // The lead created the sub-agents; they are shown, not started, from here.
  const lead = leadOf(agent, agents);
  const team = teamOf(agent, agents);
  const native = nativeSubagents(events, agent.status === "running");
  const teamSize = team.length + native.length;
  const working = team.filter((m) => m.agent.status === "running").length + native.filter((s) => s.status === "running").length;

  const turns = messages.filter((m) => m.deliveredAt !== undefined).length;
  const queued = messages.length - turns;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
        <h2 className="truncate font-semibold">{agent.name}</h2>
        <StatusLabel agent={agent} turns={turns} queued={queued} waiting={open.length > 0} />
        <span className="font-mono text-[11px] text-zinc-500">{[agent.provider, agent.model, agent.effort].filter(Boolean).join(" · ")}</span>
        {agent.worktree !== undefined && (
          <span className="flex items-center gap-1 font-mono text-[11px] text-zinc-500" title={agent.worktree.path}>
            <GitBranch size={12} aria-hidden /> {agent.worktree.branch}
          </span>
        )}
        <span className="ml-auto flex gap-1">
          {teamSize > 0 && (
            <button
              type="button"
              title="See this session's sub-agents in the agent graph"
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              onClick={() => workbench.open({ kind: "graph" })}
            >
              <Network size={13} aria-hidden /> Team · {teamSize}
              {working > 0 && <span className="text-teal-600 dark:text-teal-400">({working} working)</span>}
            </button>
          )}
          {agent.worktree !== undefined && (
            <button
              type="button"
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              onClick={() => workbench.open({ kind: "changes", agentId: agent.id })}
            >
              <FileDiff size={13} aria-hidden /> Changes
            </button>
          )}
          {agent.status === "running" && (
            <button
              type="button"
              title={formatBinding("mod+.")}
              className="flex items-center gap-1 rounded border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
              onClick={() => void fetch(`/api/agents/${agent.id}/stop`, { method: "POST" })}
            >
              <Square size={11} aria-hidden /> Stop
            </button>
          )}
        </span>
      </header>

      {lead.id !== agent.id && (
        <button
          type="button"
          className="shrink-0 border-b border-zinc-200 px-4 py-1.5 text-left text-xs text-zinc-500 hover:text-zinc-900 dark:border-zinc-800 dark:hover:text-zinc-100"
          onClick={() => workbench.open({ kind: "session", agentId: lead.id })}
        >
          Sub-agent in <span className="font-medium">{lead.name}</span>&apos;s team · it was created and is directed by its lead
        </button>
      )}


      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-5">
          {!loaded && items.length === 0 && loadError === undefined && <p className="text-sm text-zinc-500">Loading…</p>}
          {loadError !== undefined && (
            <p role="alert" className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
              Couldn&apos;t load this conversation: {loadError}
              <button type="button" className="rounded border border-zinc-300 px-2 py-0.5 text-xs text-zinc-700 dark:border-zinc-700 dark:text-zinc-300" onClick={() => setAttempt((n) => n + 1)}>
                Retry
              </button>
            </p>
          )}
          {loaded && items.length === 0 && <p className="text-sm text-zinc-500">No conversation yet. Send the first message below.</p>}
          {withToolRuns(items).map((item) =>
            item.kind === "tools" ? (
              <ToolRun key={item.key} uses={item.uses} workingDirectory={agent.workingDirectory} running={agent.status === "running"} />
            ) : item.kind === "message" ? (
              <div
                key={`m-${item.message.id}`}
                className={`max-w-[85%] self-end rounded-xl px-3.5 py-2.5 text-sm ${
                  item.message.deliveredAt === undefined
                    ? "border border-dashed border-zinc-300 text-zinc-500 dark:border-zinc-700"
                    : "bg-zinc-100 dark:bg-zinc-800"
                }`}
              >
                {item.message.kind === "system" ? (
                  <p className="mb-1 text-[11px] text-amber-600 dark:text-amber-400">mothership</p>
                ) : (
                  item.message.senderId !== undefined && (
                    <p className="mb-1 text-[11px] text-violet-500">
                      {item.message.kind === "report" ? "Report · " : "from "}
                      {agentsById.get(item.message.senderId)?.name}
                    </p>
                  )
                )}
                <p className="whitespace-pre-wrap break-words">{item.message.text}</p>
                {item.message.deliveredAt === undefined && <p className="mt-1 text-[11px]">Queued</p>}
              </div>
            ) : (
              <EventRow key={`e-${item.record.id}`} record={item.record} />
            ),
          )}
          {open.map((q) => (
            <QuestionCard key={q.id} question={q} agent={agent} now={now} selected={false} showAgent={false} />
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t border-zinc-200 p-3 dark:border-zinc-800">
        <div className="mx-auto max-w-3xl rounded-xl border border-zinc-300 bg-white focus-within:border-teal-500 dark:border-zinc-700 dark:bg-zinc-900">
          <textarea
            ref={composerRef}
            id="agent-composer"
            className="block min-h-14 w-full resize-none bg-transparent px-3.5 py-2.5 text-sm outline-none"
            rows={2}
            placeholder={agent.status === "running" ? "Working — messages you send will be queued" : `Message ${agent.name}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !sending) void send();
            }}
          />
          <div className="flex items-center gap-2 px-3 pb-2 text-[11px] text-zinc-500">
            <span className="font-mono">{[agent.provider, agent.model, agent.effort].filter(Boolean).join(" · ")}</span>
            <button
              type="button"
              disabled={sending || draft.trim() === ""}
              className="ml-auto rounded-md bg-teal-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-40"
              onClick={() => void send()}
            >
              Send {formatBinding("mod+enter")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
