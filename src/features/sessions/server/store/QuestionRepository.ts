import type { DatabaseSync } from "node:sqlite";
import type { AgentQuestion } from "@/features/sessions/model/Agent";
import { toQuestion } from "@/features/sessions/server/store/rows";

/**
 * ### QuestionRepository
 *
 * Questions agents ask you, open and recently resolved.
 */
export class QuestionRepository {
  readonly #db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.#db = db;
  }

  /**
   * ### insert
   *
   * @param question - A new open question.
   */
  insert(question: AgentQuestion): void {
    this.#db
      .prepare("INSERT INTO questions (id, agent_id, question, options, status, answer, created_at, resolved_at) VALUES (?, ?, ?, ?, ?, NULL, ?, NULL)")
      .run(question.id, question.agentId, question.question, JSON.stringify(question.options), question.status, question.createdAt);
  }

  /**
   * ### get
   *
   * @returns The question, or `undefined` if no question has this id.
   */
  get(id: string): AgentQuestion | undefined {
    const row = this.#db.prepare("SELECT * FROM questions WHERE id = ?").get(id);
    return row === undefined ? undefined : toQuestion(row);
  }

  /**
   * ### resolve
   *
   * @returns The resolved question.
   * @throws Error When the question does not exist.
   */
  resolve(id: string, status: "answered" | "dismissed", answer: string | undefined): AgentQuestion {
    const resolvedAt = Date.now();
    this.#db
      .prepare("UPDATE questions SET status = ?, answer = ?, resolved_at = ? WHERE id = ?")
      .run(status, answer ?? null, resolvedAt, id);
    const question = this.get(id);
    if (question === undefined) throw new Error(`Unknown question ${id}`);
    return question;
  }

  /**
   * ### list
   *
   * @returns Open questions plus those resolved in the last day, newest first.
   */
  list(): Array<AgentQuestion> {
    return this.#db
      .prepare("SELECT * FROM questions WHERE status = 'open' OR resolved_at > ? ORDER BY created_at DESC, rowid DESC")
      .all(Date.now() - 24 * 3_600_000)
      .map(toQuestion);
  }
}
