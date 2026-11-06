"use client";

import { useJson } from "@/ui/useJson";
import type { Agent } from "@/features/sessions/model/Agent";
import { kindsWith, namesOf } from "@/features/sessions/model/AgentEvents";
import { TOOL_GROUPS, type AgentTool, type McpServerUnavailable, type ToolNote } from "@/features/sessions/model/AgentTools";
import type { Translate } from "@/ui/i18n/translate";
import { useT } from "@/ui/i18n/useT";

function toolName(tool: AgentTool, t: Translate): string {
  return "builtIn" in tool.subject ? t(`sessions.tools.name.${tool.subject.builtIn}` as const) : tool.subject.server;
}

function toolDescription(tool: AgentTool, t: Translate): string {
  return "builtIn" in tool.subject ? t(`sessions.tools.description.${tool.subject.builtIn}` as const) : t(`sessions.tools.server.${tool.subject.kind}` as const);
}

function unavailableServerText(reason: McpServerUnavailable, t: Translate): string {
  switch (reason.code) {
    case "off-in-settings":
      return t("sessions.tools.note.unavailable.off-in-settings");
    case "disabled-in-file":
      return t("sessions.tools.note.unavailable.disabled-in-file", { file: reason.file });
    case "env-missing":
      return t("sessions.tools.note.unavailable.env-missing", { variable: reason.variable });
  }
}

function noteText(note: ToolNote, t: Translate): string {
  switch (note.code) {
    case "unavailable":
      return unavailableServerText(note.reason, t);
    case "unsupported":
      return t(`sessions.tools.note.unsupported.${note.capability}` as const, { names: namesOf(kindsWith(note.capability)) });
    default:
      return t(`sessions.tools.note.${note.code}` as const);
  }
}

/**
 * ### AgentToolsList
 *
 * What this session can use, grouped (files and web, sub-agents,
 * collaboration, MCP servers, claude.ai connectors), with how often it has
 * used each. Tools it cannot use are dimmed with the reason. Refreshes after
 * each turn.
 */
export function AgentToolsList({ agent }: { agent: Agent }) {
  const t = useT();
  // The activity time in the URL refetches the counts after each turn.
  const { data } = useJson<{ tools: Array<AgentTool> }>(`/api/agents/${agent.id}/tools?at=${agent.lastActivityAt}`, { keepPrevious: true });
  if (data === undefined) return <p className="text-xs text-zinc-500">{t("ui.loading")}</p>;
  const groups = TOOL_GROUPS.filter((group) => data.tools.some((tool) => tool.group === group));

  return (
    <div className="flex flex-col gap-2">
      {groups.map((group) => (
        <div key={group} className="flex flex-col gap-0.5">
          <h4 className="text-[10px] font-medium text-zinc-500">{t(`sessions.tools.group.${group}`)}</h4>
          <ul className="flex flex-col">
            {data.tools
              .filter((tool) => tool.group === group)
              .map((tool) => {
                const name = toolName(tool, t);
                return (
                  <li
                    key={`${group}:${name}`}
                    title={[toolDescription(tool, t), tool.note === undefined ? undefined : noteText(tool.note, t)].filter(Boolean).join(" · ")}
                    className={`flex items-center gap-2 text-xs ${tool.available ? "" : "text-zinc-400 line-through decoration-zinc-400/60 dark:text-zinc-600"}`}
                  >
                    <span className={`size-1.5 shrink-0 rounded-full ${tool.available ? "bg-teal-500" : "bg-zinc-300 dark:bg-zinc-700"}`} aria-hidden />
                    <span className="min-w-0 truncate">{name}</span>
                    {tool.uses > 0 && (
                      <span className="ml-auto shrink-0 rounded bg-zinc-200/70 px-1 font-mono text-[10px] text-zinc-600 no-underline dark:bg-zinc-800 dark:text-zinc-300">
                        ×{tool.uses}
                      </span>
                    )}
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </div>
  );
}
