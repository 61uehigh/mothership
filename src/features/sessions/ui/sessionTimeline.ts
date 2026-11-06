import type { AgentEventRecord, AgentMessage } from "@/features/sessions/model/Agent";
import type { ToolResult } from "@/features/sessions/model/AgentEvents";
import type { ToolUse } from "@/features/sessions/ui/ToolCard";

/**
 * ### TimelineItem
 *
 * One message or event in a session's conversation, with the time it is sorted by.
 */
export type TimelineItem = { kind: "message"; at: number; message: AgentMessage } | { kind: "event"; at: number; record: AgentEventRecord };

/**
 * ### TimelineEntry
 *
 * One row the conversation shows: a message, an event, or a run of tool calls.
 */
export type TimelineEntry = TimelineItem | { kind: "tools"; key: string; uses: Array<ToolUse> };

/**
 * ### upsertMessage
 *
 * Replaces the message with the same id, or appends it when there is none.
 */
export function upsertMessage(list: Array<AgentMessage>, message: AgentMessage): Array<AgentMessage> {
  return list.some((m) => m.id === message.id) ? list.map((m) => (m.id === message.id ? message : m)) : [...list, message];
}

/**
 * ### timelineItems
 *
 * Messages and events in one list, oldest first. A queued message (not yet
 * delivered) sorts after everything.
 */
export function timelineItems(messages: Array<AgentMessage>, events: Array<AgentEventRecord>): Array<TimelineItem> {
  return [
    ...messages.map((message): TimelineItem => ({ kind: "message", at: message.deliveredAt ?? Infinity, message })),
    ...events.map((record): TimelineItem => ({ kind: "event", at: record.createdAt, record })),
  ].sort((a, b) => a.at - b.at);
}

/**
 * ### withToolRuns
 *
 * Folds consecutive tool calls into one run and pairs each call with its
 * result. Results and sub-agent steps are not shown on their own (they appear
 * in the call's card and the team tree), so they do not break a run.
 */
export function withToolRuns(items: Array<TimelineItem>): Array<TimelineEntry> {
  const results = new Map<string, ToolResult>();
  for (const item of items) {
    if (item.kind === "event" && item.record.event.type === "tool_result") {
      const { id, output, failed } = item.record.event;
      results.set(id, { output, failed });
    }
  }
  const shown: Array<TimelineEntry> = [];
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
