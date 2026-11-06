import type { NewAgentDraft } from "@/features/sessions/model/NewAgentDraft";
import type { DashboardItem, ToolKind } from "@/features/tools/model/Dashboard";

/**
 * ### draftFor
 *
 * @returns A new-agent draft that hands `item` to an agent, named after the
 *   item so it is easy to find in the graph.
 */
export function draftFor(kind: ToolKind, item: DashboardItem): NewAgentDraft {
  const label = kind === "linear" ? item.id : item.title;
  const slug = label
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
  // No role: a hand-off starts a lead like any session, and the lead picks who does the work.
  return { name: `${kind}-${slug}`, initialMessage: item.delegatePrompt };
}
