import type { DatabaseSync } from "node:sqlite";
import { optionalString } from "@/features/sessions/server/store/rows";

/**
 * ### ControlTokens
 *
 * The secrets agents' mothership MCP servers authenticate with, one per agent.
 */
export class ControlTokens {
  readonly #db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.#db = db;
  }

  /**
   * ### agentFor
   *
   * @returns The agent owning `token`, or `undefined` for an unknown token.
   */
  agentFor(token: string): string | undefined {
    const row = this.#db.prepare("SELECT id FROM agents WHERE control_token = ?").get(token);
    return row === undefined ? undefined : (row.id as string);
  }

  /**
   * ### forAgent
   *
   * Issues a token for agents created before tokens existed.
   *
   * @returns The agent's token.
   */
  forAgent(agentId: string, issue: () => string): string {
    const row = this.#db.prepare("SELECT control_token FROM agents WHERE id = ?").get(agentId);
    const existing = optionalString(row?.control_token);
    if (existing !== undefined) return existing;
    const token = issue();
    this.#db.prepare("UPDATE agents SET control_token = ? WHERE id = ?").run(token, agentId);
    return token;
  }
}
