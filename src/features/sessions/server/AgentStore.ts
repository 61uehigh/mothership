import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { HistoryItem } from "@/features/sessions/model/Import";
import { AgentRepository } from "@/features/sessions/server/store/AgentRepository";
import { ControlTokens } from "@/features/sessions/server/store/ControlTokens";
import { openDatabase, transaction } from "@/features/sessions/server/store/database";
import { EventRepository } from "@/features/sessions/server/store/EventRepository";
import { MessageRepository } from "@/features/sessions/server/store/MessageRepository";
import { QuestionRepository } from "@/features/sessions/server/store/QuestionRepository";

/**
 * ### AgentStore
 *
 * SQLite persistence for sessions, one repository per table on one
 * connection. Code depends on the repository it uses; the store itself only
 * runs the operations that span tables.
 */
export class AgentStore {
  readonly #db: DatabaseSync;
  readonly agents: AgentRepository;
  readonly tokens: ControlTokens;
  readonly questions: QuestionRepository;
  readonly messages: MessageRepository;
  readonly events: EventRepository;

  /**
   * @param file - Database path; parent directories are created.
   */
  constructor(file: string) {
    this.#db = openDatabase(file);
    this.agents = new AgentRepository(this.#db);
    this.tokens = new ControlTokens(this.#db);
    this.questions = new QuestionRepository(this.#db);
    this.messages = new MessageRepository(this.#db);
    this.events = new EventRepository(this.#db);
  }

  /**
   * ### deleteAgent
   *
   * Removes the agent with its messages, events, and questions. Messages it
   * sent to other agents stay in their history without a sender, and its
   * sub-agents become top-level.
   */
  deleteAgent(id: string): void {
    transaction(this.#db, () => {
      this.#db.prepare("UPDATE messages SET sender_id = NULL WHERE sender_id = ?").run(id);
      this.#db.prepare("UPDATE agents SET parent_id = NULL WHERE parent_id = ?").run(id);
      this.#db.prepare("DELETE FROM messages WHERE agent_id = ?").run(id);
      this.#db.prepare("DELETE FROM events WHERE agent_id = ?").run(id);
      this.#db.prepare("DELETE FROM questions WHERE agent_id = ?").run(id);
      this.#db.prepare("DELETE FROM agents WHERE id = ?").run(id);
    });
  }

  /**
   * ### insertHistory
   *
   * Writes an imported conversation for `agentId` in one transaction: your
   * messages as delivered messages and everything else as events, timed one
   * millisecond apart from `startedAt` so they keep their order.
   *
   * @param startedAt - Epoch milliseconds for the first item.
   */
  insertHistory(agentId: string, items: Array<HistoryItem>, startedAt: number): void {
    const message = this.#db.prepare(
      "INSERT INTO messages (id, agent_id, sender_id, kind, text, created_at, delivered_at) VALUES (?, ?, NULL, ?, ?, ?, ?)",
    );
    const event = this.#db.prepare("INSERT INTO events (agent_id, payload, created_at) VALUES (?, ?, ?)");
    transaction(this.#db, () => {
      items.forEach((item, i) => {
        const at = startedAt + i;
        if (item.kind === "event") event.run(agentId, JSON.stringify(item.event), at);
        else message.run(randomUUID(), agentId, item.kind === "note" ? "system" : "message", item.text, at, at);
      });
    });
  }
}
