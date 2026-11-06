import type { AgentEventRecord } from "@/features/sessions/model/Agent";

/**
 * ### NativeSubagent
 *
 * A sub-agent the lead's provider ran on its own (Claude's Agent tool), read
 * from the lead's events. mothership did not create it and cannot message it.
 */
export type NativeSubagent = {
  id: string;
  description: string;
  /** Claude's sub-agent type, e.g. `general-purpose` or `Explore`. */
  kind: string;
  model: string | undefined;
  status: "running" | "done" | "failed";
  /** The tool it used last, while running. */
  lastTool: string | undefined;
  steps: number;
  /** Its report, once done. */
  output: string | undefined;
  startedAt: number;
};

/**
 * ### nativeSubagents
 *
 * @returns The provider's own sub-agents in `events`, oldest first. One still
 *   "running" when its turn has already ended (e.g. after a stop) is shown as failed.
 */
export function nativeSubagents(events: Array<AgentEventRecord>, turnRunning: boolean): Array<NativeSubagent> {
  const byId = new Map<string, NativeSubagent>();
  for (const { event, createdAt } of events) {
    if (event.type !== "subagent") continue;
    if (event.phase === "start") {
      byId.set(event.id, {
        id: event.id,
        description: event.description,
        kind: event.kind,
        model: event.model,
        status: "running",
        lastTool: undefined,
        steps: 0,
        output: undefined,
        startedAt: createdAt,
      });
      continue;
    }
    const current = byId.get(event.id);
    if (current === undefined) continue;
    if (event.phase === "step") byId.set(event.id, { ...current, lastTool: event.tool, steps: current.steps + 1 });
    else byId.set(event.id, { ...current, status: event.failed ? "failed" : "done", output: event.output, lastTool: undefined });
  }
  return [...byId.values()].map((s) => (s.status === "running" && !turnRunning ? { ...s, status: "failed" } : s));
}
