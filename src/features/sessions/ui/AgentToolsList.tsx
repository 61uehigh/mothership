"use client";

import { useJson } from "@/ui/useJson";
import type { Agent } from "@/features/sessions/model/Agent";
import type { AgentTool } from "@/features/sessions/model/AgentTools";

/**
 * ### AgentToolsList
 *
 * What this session can use, grouped (files and web, sub-agents,
 * collaboration, MCP servers, claude.ai connectors), with how often it has
 * used each. Tools it cannot use are dimmed with the reason. Refreshes after
 * each turn.
 */
export function AgentToolsList({ agent }: { agent: Agent }) {
  // The activity time in the URL refetches the counts after each turn.
  const { data } = useJson<{ tools: Array<AgentTool> }>(`/api/agents/${agent.id}/tools?at=${agent.lastActivityAt}`, { keepPrevious: true });
  if (data === undefined) return <p className="text-xs text-zinc-500">Loading…</p>;
  const groups = [...new Set(data.tools.map((t) => t.group))];

  return (
    <div className="flex flex-col gap-2">
      {groups.map((group) => (
        <div key={group} className="flex flex-col gap-0.5">
          <h4 className="text-[10px] font-medium text-zinc-500">{group}</h4>
          <ul className="flex flex-col">
            {data.tools
              .filter((t) => t.group === group)
              .map((tool) => (
                <li
                  key={`${group}:${tool.name}`}
                  title={[tool.description, tool.note].filter(Boolean).join(" · ")}
                  className={`flex items-center gap-2 text-xs ${tool.available ? "" : "text-zinc-400 line-through decoration-zinc-400/60 dark:text-zinc-600"}`}
                >
                  <span className={`size-1.5 shrink-0 rounded-full ${tool.available ? "bg-teal-500" : "bg-zinc-300 dark:bg-zinc-700"}`} aria-hidden />
                  <span className="min-w-0 truncate">{tool.name}</span>
                  {tool.uses > 0 && (
                    <span className="ml-auto shrink-0 rounded bg-zinc-200/70 px-1 font-mono text-[10px] text-zinc-600 no-underline dark:bg-zinc-800 dark:text-zinc-300">
                      ×{tool.uses}
                    </span>
                  )}
                </li>
              ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
