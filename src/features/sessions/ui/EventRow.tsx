import { memo } from "react";
import { Markdown } from "@/shell/Markdown";
import type { AgentEventRecord } from "@/features/sessions/model/Agent";
import { AGENT_KIND_LABELS, type TurnFailure, type TurnUsage } from "@/features/sessions/model/AgentEvents";
import { IMPORT_SOURCE_LABELS } from "@/features/sessions/model/Import";
import { useFormat } from "@/ui/i18n/format";
import { useT } from "@/ui/i18n/useT";
import type { Translate } from "@/ui/i18n/translate";

/** A token count in a few characters: 950, 12.3k, 1.2M. */
function tokens(count: number): string {
  if (count < 1000) return String(count);
  if (count < 1_000_000) return `${(count / 1000).toFixed(count < 10_000 ? 1 : 0)}k`;
  return `${(count / 1_000_000).toFixed(1)}M`;
}

function dollars(amount: number): string {
  return amount < 0.01 ? "<$0.01" : `$${amount.toFixed(2)}`;
}

/** A failed turn mothership framed itself, in the chosen language; the provider's own reason stays as it is. */
function turnFailureText(t: Translate, failure: TurnFailure): string {
  const provider = AGENT_KIND_LABELS[failure.provider];
  if (failure.code === "stream-ended") return t("sessions.event.streamEnded", { provider });
  if (failure.reason === "error_max_turns") return t("sessions.event.maxTurns", { provider });
  return t("sessions.event.runFailed", { provider, reason: failure.reason });
}

/**
 * What a finished turn used: its cost when you pay per token (an API key), else
 * its tokens, since a Claude login's cost is only an estimate. The other figures
 * are in the tooltip.
 */
function TurnUsageLabel({ usage }: { usage: TurnUsage }) {
  const t = useT();
  const { dateLocale } = useFormat();
  const input = usage.inputTokens + usage.cacheWriteTokens;
  const breakdown = t("sessions.event.usageBreakdown", {
    input: input.toLocaleString(dateLocale),
    output: usage.outputTokens.toLocaleString(dateLocale),
    cached: usage.cacheReadTokens.toLocaleString(dateLocale),
  });
  return usage.billing === "api" ? (
    <span title={breakdown}> · {dollars(usage.costUsd)}</span>
  ) : (
    <span title={t("sessions.event.usageLoginTitle", { breakdown, cost: dollars(usage.costUsd) })}>
      {" "}
      {t("sessions.event.usageTokens", { input: tokens(input), output: tokens(usage.outputTokens), cached: tokens(usage.cacheReadTokens) })}
    </span>
  );
}

/**
 * ### EventRow
 *
 * One agent event in the conversation: text (as Markdown), a finished turn with what it
 * used, an error, a sub-agent starting or ending, or where imported history ends. Renders nothing for tool
 * calls, tool results, and sub-agent steps, which show elsewhere.
 */
export const EventRow = memo(function EventRow({ record }: { record: AgentEventRecord }) {
  const t = useT();
  const { event } = record;
  switch (event.type) {
    case "text":
      // A session id is an Explorer root for its working folder, which the agent's relative links name.
      return <Markdown fileRoot={record.agentId}>{event.text}</Markdown>;
    case "tool":
    case "tool_result":
      // Shown as tool cards (see withToolRuns).
      return undefined;
    case "done":
      return (
        <div className="text-[11px] text-green-600 dark:text-green-400">
          {t("sessions.event.turnComplete")}{event.usage !== undefined && <TurnUsageLabel usage={event.usage} />}
        </div>
      );
    case "error":
      return (
        <div className="break-words text-sm text-red-600 dark:text-red-400">
          {event.failure === undefined ? `✗ ${event.message}` : turnFailureText(t, event.failure)}
        </div>
      );
    case "imported":
      return (
        <div className="text-[11px] text-amber-600 dark:text-amber-400">
          {t(event.forked ? "sessions.event.importedForked" : "sessions.event.importedSameThread", { source: IMPORT_SOURCE_LABELS[event.from] })}
        </div>
      );
    case "subagent":
      // Steps show in the team tree; the conversation keeps only the start and end.
      if (event.phase === "step") return undefined;
      return (
        <div className="text-[11px] text-zinc-500">
          {event.phase === "start"
            ? t("sessions.event.subagentStarted", { description: event.description, kind: event.kind })
            : event.failed
              ? t("sessions.event.subagentFailed")
              : t("sessions.event.subagentFinished")}
        </div>
      );
  }
});
