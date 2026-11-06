"use client";

import { useEffect, useMemo, useRef } from "react";
import { useShell } from "@/shell/shellContext";
import { useWorkbenchActions } from "@/shell/workbenchContext";
import { useNow } from "@/ui/useNow";
import { useT } from "@/ui/i18n/useT";
import { richText } from "@/features/sessions/ui/richText";
import type { Agent } from "@/features/sessions/model/Agent";
import { EventRow } from "@/features/sessions/ui/EventRow";
import { MessageBubble } from "@/features/sessions/ui/MessageBubble";
import { QuestionCard } from "@/features/sessions/ui/questions/QuestionCard";
import { ReplyComposer } from "@/features/sessions/ui/ReplyComposer";
import { RestartNotice } from "@/features/sessions/ui/RestartNotice";
import { SessionHeader } from "@/features/sessions/ui/SessionHeader";
import { timelineItems, withToolRuns } from "@/features/sessions/ui/sessionTimeline";
import { leadOf, nativeSubagents, teamOf } from "@/features/sessions/ui/team";
import { ToolRun } from "@/features/sessions/ui/toolCards";
import { useSessionCommands } from "@/features/sessions/ui/useSessionCommands";
import { useSessionConversation } from "@/features/sessions/ui/useSessionConversation";

const CLOCK_TICK_MS = 30_000;

/** How near the bottom still counts as "at the bottom" for following new items. */
const FOLLOW_SLACK_PX = 80;

/**
 * ### SessionView
 *
 * The center tab for one agent session, styled after Claude Code: the
 * conversation (messages, tool calls, results), open questions inline, and a
 * composer. Session details live in the foldable details column beside it
 * (`SessionInfo`).
 */
export function SessionView({ agent }: { agent: Agent }) {
  const t = useT();
  const { agents, questions } = useShell();
  const workbench = useWorkbenchActions();
  const now = useNow(CLOCK_TICK_MS);
  const { messages, events, loaded, loadError, retry } = useSessionConversation(agent.id);
  const bottomRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const agentsById = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);
  const open = questions.filter((q) => q.agentId === agent.id && q.status === "open");

  const items = useMemo(() => withToolRuns(timelineItems(messages, events)), [messages, events]);
  // Follows new items only while you are at the bottom, so a running agent never pulls you away from history you are reading.
  const atBottom = useRef(true);

  useEffect(() => {
    if (atBottom.current) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, events.length]);

  useSessionCommands(agent, composerRef);

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
      <SessionHeader agent={agent} turns={turns} queued={queued} waiting={open.length > 0} teamSize={teamSize} working={working} />

      {lead.id !== agent.id && (
        <button
          type="button"
          className="shrink-0 border-b border-zinc-200 px-4 py-1.5 text-left text-xs text-zinc-500 hover:text-zinc-900 dark:border-zinc-800 dark:hover:text-zinc-100"
          onClick={() => workbench.open({ kind: "session", agentId: lead.id })}
        >
          {richText(t("sessions.view.subAgentOf", { lead: "{lead}" }), { lead: <span className="font-medium">{lead.name}</span> })}
        </button>
      )}

      <div
        className="min-h-0 flex-1 overflow-y-auto"
        onScroll={(event) => {
          const el = event.currentTarget;
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < FOLLOW_SLACK_PX;
        }}
      >
        <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-5">
          {!loaded && items.length === 0 && loadError === undefined && <p className="text-sm text-zinc-500">{t("ui.loading")}</p>}
          {loadError !== undefined && (
            <p role="alert" className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
              {t("sessions.view.loadFailed", { error: loadError })}
              <button
                type="button"
                className="rounded border border-zinc-300 px-2 py-0.5 text-xs text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
                onClick={retry}
              >
                {t("ui.retry")}
              </button>
            </p>
          )}
          {loaded && items.length === 0 && <p className="text-sm text-zinc-500">{t("sessions.view.empty")}</p>}
          {items.map((item) =>
            item.kind === "tools" ? (
              <ToolRun key={item.key} uses={item.uses} workingDirectory={agent.workingDirectory} running={agent.status === "running"} />
            ) : item.kind === "message" ? (
              <MessageBubble
                key={`m-${item.message.id}`}
                message={item.message}
                senderName={item.message.senderId === undefined ? undefined : agentsById.get(item.message.senderId)?.name}
              />
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

      <RestartNotice agent={agent} agents={agents} />
      <ReplyComposer ref={composerRef} agent={agent} />
    </div>
  );
}
