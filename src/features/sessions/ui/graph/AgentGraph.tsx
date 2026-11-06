"use client";

import type { Agent, AgentMessage, AgentQuestion } from "@/features/sessions/model/Agent";
import type { NativeSubagent } from "@/features/sessions/model/Subagents";
import { AgentCard, CARD_HEIGHT, CARD_WIDTH } from "@/features/sessions/ui/graph/AgentCard";
import { NativeSubagentCard } from "@/features/sessions/ui/graph/NativeSubagentCard";

const GAP_X = 72;
const GAP_Y = 18;
const PADDING = 16;

type Position = { x: number; y: number };
/** Anything drawn as a card: an agent, or a sub-agent its provider ran on its own. */
type GraphNode = { id: string; parentId: string | undefined };

/** Node id of a provider sub-agent; prefixed so it never collides with an agent id. */
const nativeId = (sub: NativeSubagent) => `native:${sub.id}`;

/**
 * Tidy tree layout: leaves take consecutive rows, a parent sits at the
 * midpoint of its first and last child, and depth sets the column.
 */
function layout(agents: Array<GraphNode>): Map<string, Position> {
  const ids = new Set(agents.map((a) => a.id));
  const children = new Map<string | undefined, Array<GraphNode>>();
  for (const agent of agents) {
    // Parents hidden by the filter are treated as absent, so the child becomes a root.
    const parent = agent.parentId !== undefined && ids.has(agent.parentId) ? agent.parentId : undefined;
    children.set(parent, [...(children.get(parent) ?? []), agent]);
  }

  const rows = new Map<string, { row: number; depth: number }>();
  let nextLeafRow = 0;
  function place(agent: GraphNode, depth: number): number {
    const kids = children.get(agent.id) ?? [];
    let row: number;
    if (kids.length === 0) {
      row = nextLeafRow++;
    } else {
      const kidRows = kids.map((kid) => place(kid, depth + 1));
      row = (kidRows[0] + kidRows[kidRows.length - 1]) / 2;
    }
    rows.set(agent.id, { row, depth });
    return row;
  }
  for (const root of children.get(undefined) ?? []) place(root, 0);

  return new Map(
    [...rows].map(([id, { row, depth }]) => [
      id,
      { x: PADDING + depth * (CARD_WIDTH + GAP_X), y: PADDING + row * (CARD_HEIGHT + GAP_Y) },
    ]),
  );
}

function curve(from: Position, to: Position, offsetY: number): string {
  const x1 = from.x + CARD_WIDTH;
  const y1 = from.y + CARD_HEIGHT / 2 + offsetY;
  const x2 = to.x;
  const y2 = to.y + CARD_HEIGHT / 2 + offsetY;
  const mid = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
}

/**
 * ### AgentGraph
 *
 * Agents laid out as a spawn tree. Dashed arrows run from creator to created;
 * solid lines join agents that have messaged each other. Sub-agents a
 * provider ran on its own (`native`, e.g. Claude's Agent tool) hang off the
 * agent that ran them as dashed, read-only cards.
 */
export function AgentGraph({
  agents,
  messages,
  questions,
  now,
  native = {},
  onSelect,
}: {
  agents: Array<Agent>;
  messages: Array<AgentMessage>;
  questions: Array<AgentQuestion>;
  now: number;
  /** Provider sub-agents by the id of the agent that ran them. */
  native?: Record<string, Array<NativeSubagent>>;
  /** Opens an agent's session; a provider sub-agent opens the session that ran it. */
  onSelect: (id: string) => void;
}) {
  const shown = new Set(agents.map((a) => a.id));
  const natives = Object.entries(native)
    .filter(([agentId]) => shown.has(agentId))
    .flatMap(([agentId, subs]) => subs.map((sub) => ({ agentId, sub })));
  const positions = layout([
    ...agents.map((a) => ({ id: a.id, parentId: a.parentId })),
    ...natives.map(({ agentId, sub }) => ({ id: nativeId(sub), parentId: agentId })),
  ]);
  const all = [...positions.values()];
  const width = Math.max(...all.map((p) => p.x + CARD_WIDTH), 0) + PADDING;
  const height = Math.max(...all.map((p) => p.y + CARD_HEIGHT), 0) + PADDING;

  const turns = new Map<string, number>();
  const queued = new Map<string, number>();
  const talkPairs = new Set<string>();
  const waiting = new Set(questions.filter((q) => q.status === "open").map((q) => q.agentId));
  for (const message of messages) {
    if (message.deliveredAt === undefined) queued.set(message.agentId, (queued.get(message.agentId) ?? 0) + 1);
    else turns.set(message.agentId, (turns.get(message.agentId) ?? 0) + 1);
    if (message.senderId !== undefined) talkPairs.add(`${message.senderId}→${message.agentId}`);
  }

  return (
    <div className="relative" style={{ width, height }}>
      <svg className="pointer-events-none absolute inset-0" width={width} height={height} aria-hidden>
        <defs>
          <marker id="spawn-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" className="fill-zinc-400 dark:fill-zinc-500" />
          </marker>
        </defs>
        {agents.map((agent) => {
          const from = agent.parentId === undefined ? undefined : positions.get(agent.parentId);
          const to = positions.get(agent.id);
          if (from === undefined || to === undefined) return undefined;
          return (
            <path
              key={`spawn-${agent.id}`}
              d={curve(from, to, 0)}
              fill="none"
              strokeDasharray="5 4"
              markerEnd="url(#spawn-arrow)"
              className="stroke-zinc-400 dark:stroke-zinc-500"
              strokeWidth={1.25}
            />
          );
        })}
        {natives.map(({ agentId, sub }) => {
          const from = positions.get(agentId);
          const to = positions.get(nativeId(sub));
          if (from === undefined || to === undefined) return undefined;
          return (
            <path
              key={`native-${sub.id}`}
              d={curve(from, to, 0)}
              fill="none"
              strokeDasharray="2 4"
              markerEnd="url(#spawn-arrow)"
              className="stroke-zinc-400/70 dark:stroke-zinc-600"
              strokeWidth={1.25}
            />
          );
        })}
        {[...talkPairs].map((pair) => {
          const [senderId, receiverId] = pair.split("→");
          const a = positions.get(senderId);
          const b = positions.get(receiverId);
          if (a === undefined || b === undefined) return undefined;
          // Draw left to right regardless of direction; offset so it does not sit on the spawn edge.
          const [left, right] = a.x <= b.x ? [a, b] : [b, a];
          return (
            <path
              key={`talk-${pair}`}
              d={curve(left, right, -10)}
              fill="none"
              className="stroke-violet-400 dark:stroke-violet-400"
              strokeWidth={1.5}
            />
          );
        })}
      </svg>
      {agents.map((agent) => {
        const position = positions.get(agent.id);
        if (position === undefined) return undefined;
        return (
          <div key={agent.id} className="absolute" style={{ left: position.x, top: position.y }}>
            <AgentCard
              agent={agent}
              turns={turns.get(agent.id) ?? 0}
              queued={queued.get(agent.id) ?? 0}
              waiting={waiting.has(agent.id)}
              now={now}
              onSelect={() => onSelect(agent.id)}
            />
          </div>
        );
      })}
      {natives.map(({ agentId, sub }) => {
        const position = positions.get(nativeId(sub));
        if (position === undefined) return undefined;
        return (
          <div key={nativeId(sub)} className="absolute" style={{ left: position.x, top: position.y }}>
            <NativeSubagentCard sub={sub} onSelect={() => onSelect(agentId)} />
          </div>
        );
      })}
    </div>
  );
}
