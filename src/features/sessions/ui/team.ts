import type { Agent } from "@/features/sessions/model/Agent";

/**
 * ### TeamMember
 *
 * One agent below a lead, with its depth (1 = created by the lead itself).
 */
export type TeamMember = { agent: Agent; depth: number };

/**
 * ### leadOf
 *
 * @returns The top of `agent`'s family: the session you started that (directly
 *   or through other sub-agents) created it. An agent whose parent is gone is
 *   its own lead.
 */
export function leadOf(agent: Agent, agents: Array<Agent>): Agent {
  const byId = new Map(agents.map((a) => [a.id, a]));
  let current = agent;
  // Bounded by the agent count, so a corrupt parent cycle cannot loop forever.
  for (let i = 0; i < agents.length; i++) {
    const parent = current.parentId === undefined ? undefined : byId.get(current.parentId);
    if (parent === undefined) return current;
    current = parent;
  }
  return current;
}

/**
 * ### teamOf
 *
 * @returns Everything `lead` created, directly or through its sub-agents, in
 *   tree order (each agent followed by its own sub-agents, oldest first).
 */
export function teamOf(lead: Agent, agents: Array<Agent>): Array<TeamMember> {
  const children = new Map<string, Array<Agent>>();
  for (const a of agents) {
    if (a.parentId === undefined) continue;
    children.set(a.parentId, [...(children.get(a.parentId) ?? []), a]);
  }
  const out: Array<TeamMember> = [];
  const walk = (id: string, depth: number) => {
    for (const child of [...(children.get(id) ?? [])].sort((a, b) => a.createdAt - b.createdAt)) {
      out.push({ agent: child, depth });
      walk(child.id, depth + 1);
    }
  };
  walk(lead.id, 1);
  return out;
}

export { nativeSubagents, type NativeSubagent } from "@/features/sessions/model/Subagents";
