import type { DatabaseSync } from "node:sqlite";
import type { AgentMessage } from "@/features/sessions/model/Agent";
import { toMessage } from "@/features/sessions/server/store/rows";

/**
 * ### MessageRepository
 *
 * Messages queued for agents and their delivery.
 */
export class MessageRepository {
  readonly #db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.#db = db;
  }

  /**
   * ### insert
   *
   * @param message - A new, undelivered message.
   */
  insert(message: AgentMessage): void {
    this.#db
      .prepare("INSERT INTO messages (id, agent_id, sender_id, kind, text, created_at, delivered_at) VALUES (?, ?, ?, ?, ?, ?, NULL)")
      .run(message.id, message.agentId, message.senderId ?? null, message.kind, message.text, message.createdAt);
  }

  /**
   * ### agentsWithQueued
   *
   * @returns Ids of agents that have undelivered messages, oldest message first.
   */
  agentsWithQueued(): Array<string> {
    return this.#db
      .prepare("SELECT agent_id FROM messages WHERE delivered_at IS NULL GROUP BY agent_id ORDER BY MIN(created_at)")
      .all()
      .map((row) => row.agent_id as string);
  }

  /**
   * ### takeNext
   *
   * Marks the oldest queued message for an agent as delivered.
   *
   * @returns The delivered message, or `undefined` when the queue is empty.
   */
  takeNext(agentId: string): AgentMessage | undefined {
    const row = this.#db
      .prepare(
        `UPDATE messages SET delivered_at = ?
         WHERE rowid = (SELECT rowid FROM messages WHERE agent_id = ? AND delivered_at IS NULL ORDER BY created_at, rowid LIMIT 1)
         RETURNING *`,
      )
      .get(Date.now(), agentId);
    return row === undefined ? undefined : toMessage(row);
  }

  /**
   * ### queuedCounts
   *
   * @param agentId - Restrict to one agent; `undefined` counts for every agent.
   * @returns Undelivered message counts by agent id; agents with none are absent.
   */
  queuedCounts(agentId: string | undefined): Map<string, number> {
    const rows =
      agentId === undefined
        ? this.#db.prepare("SELECT agent_id, COUNT(*) AS n FROM messages WHERE delivered_at IS NULL GROUP BY agent_id").all()
        : this.#db
            .prepare("SELECT agent_id, COUNT(*) AS n FROM messages WHERE delivered_at IS NULL AND agent_id = ? GROUP BY agent_id")
            .all(agentId);
    return new Map(rows.map((row) => [String(row.agent_id), Number(row.n)]));
  }

  /**
   * ### list
   *
   * @param agentId - Restrict to one agent; `undefined` returns all messages.
   * @returns Messages, oldest first.
   */
  list(agentId: string | undefined): Array<AgentMessage> {
    const statement =
      agentId === undefined
        ? this.#db.prepare("SELECT * FROM messages ORDER BY created_at, rowid")
        : this.#db.prepare("SELECT * FROM messages WHERE agent_id = ? ORDER BY created_at, rowid");
    const rows = agentId === undefined ? statement.all() : statement.all(agentId);
    return rows.map(toMessage);
  }
}
