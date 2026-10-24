import type { DatabaseSync } from "node:sqlite";
import type { AgentEventRecord } from "@/features/sessions/model/Agent";
import { optionalString, toEvent } from "@/features/sessions/server/store/rows";

/**
 * ### EventRepository
 *
 * Each agent's event log: text, tool calls, results, and turn ends.
 */
export class EventRepository {
  readonly #db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.#db = db;
  }

  /**
   * ### insert
   *
   * @returns The stored record with its assigned id.
   */
  insert(agentId: string, event: AgentEventRecord["event"]): AgentEventRecord {
    const createdAt = Date.now();
    const result = this.#db
      .prepare("INSERT INTO events (agent_id, payload, created_at) VALUES (?, ?, ?)")
      .run(agentId, JSON.stringify(event), createdAt);
    this.#db.prepare("UPDATE agents SET last_activity_at = ? WHERE id = ?").run(createdAt, agentId);
    return { id: Number(result.lastInsertRowid), agentId, event, createdAt };
  }

  /**
   * ### list
   *
   * @returns The agent's events, oldest first.
   */
  list(agentId: string): Array<AgentEventRecord> {
    return this.#db.prepare("SELECT * FROM events WHERE agent_id = ? ORDER BY id").all(agentId).map(toEvent);
  }

  /**
   * ### subagentEvents
   *
   * @returns Every agent's provider sub-agent events (see NativeSubagentEvent), oldest first.
   */
  subagentEvents(): Array<AgentEventRecord> {
    return this.#db.prepare("SELECT * FROM events WHERE json_extract(payload, '$.type') = 'subagent' ORDER BY id").all().map(toEvent);
  }

  /**
   * ### lastDoneOutput
   *
   * Reads only the newest `done` event instead of the whole event log.
   *
   * @returns The output of the agent's most recent finished turn, or
   *   `undefined` when no turn has finished yet.
   */
  lastDoneOutput(agentId: string): string | undefined {
    const row = this.#db
      .prepare(
        `SELECT json_extract(payload, '$.output') AS output FROM events
         WHERE agent_id = ? AND json_extract(payload, '$.type') = 'done'
         ORDER BY id DESC LIMIT 1`,
      )
      .get(agentId);
    return optionalString(row?.output);
  }
}
