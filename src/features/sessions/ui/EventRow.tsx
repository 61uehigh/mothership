import { memo } from "react";
import type { AgentEventRecord } from "@/features/sessions/model/Agent";
import type { TurnUsage } from "@/features/sessions/model/AgentEvents";

/** A token count in a few characters: 950, 12.3k, 1.2M. */
function tokens(count: number): string {
  if (count < 1000) return String(count);
  if (count < 1_000_000) return `${(count / 1000).toFixed(count < 10_000 ? 1 : 0)}k`;
  return `${(count / 1_000_000).toFixed(1)}M`;
}

function dollars(amount: number): string {
  return amount < 0.01 ? "<$0.01" : `$${amount.toFixed(2)}`;
}

/**
 * What a finished turn used: its cost when you pay per token (an API key), else
 * its tokens, since a Claude login's cost is only an estimate. The other figures
 * are in the tooltip.
 */
function TurnUsageLabel({ usage }: { usage: TurnUsage }) {
  const input = usage.inputTokens + usage.cacheWriteTokens;
  const breakdown = `${input.toLocaleString()} input, ${usage.outputTokens.toLocaleString()} output, ${usage.cacheReadTokens.toLocaleString()} cached input tokens`;
  return usage.billing === "api" ? (
    <span title={breakdown}> · {dollars(usage.costUsd)}</span>
  ) : (
    <span title={`${breakdown}. About ${dollars(usage.costUsd)} at API prices; your Claude login is not charged by token.`}>
      {" "}
      · {tokens(input)} in · {tokens(usage.outputTokens)} out · {tokens(usage.cacheReadTokens)} cached
    </span>
  );
}

/**
 * ### EventRow
 *
 * One agent event in the conversation: text, a finished turn with what it
 * used, an error, or a sub-agent starting or ending. Renders nothing for tool
 * calls, tool results, and sub-agent steps, which show elsewhere.
 */
export const EventRow = memo(function EventRow({ record }: { record: AgentEventRecord }) {
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
          ✓ Turn complete{event.usage !== undefined && <TurnUsageLabel usage={event.usage} />}
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
});
