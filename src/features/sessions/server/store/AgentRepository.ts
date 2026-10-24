import type { DatabaseSync } from "node:sqlite";
import type { Agent, AgentLink, AgentStatus, Worktree } from "@/features/sessions/model/Agent";
import { toAgent } from "@/features/sessions/server/store/rows";

/**
 * ### AgentRepository
 *
 * Agents' rows: profile, status, worktree, and settings.
 */
export class AgentRepository {
  readonly #db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.#db = db;
  }

  /**
   * ### insert
   *
   * @param agent - A new agent; its id must be unused.
   * @param controlToken - Secret the agent's mothership MCP server authenticates with.
   */
  insert(agent: Agent, controlToken: string): void {
    this.#db
      .prepare(
        `INSERT INTO agents (id, name, role, provider, model, effort, parent_id, status, session_ref,
           working_directory, mcp, created_at, last_activity_at, control_token, status_note, links, worktree, compare_group,
           archived_at, allow_git)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        agent.id,
        agent.name,
        agent.role ?? null,
        agent.provider,
        agent.model ?? null,
        agent.effort ?? null,
        agent.parentId ?? null,
        agent.status,
        agent.sessionRef ?? null,
        agent.workingDirectory,
        agent.mcp === undefined ? null : JSON.stringify(agent.mcp),
        agent.createdAt,
        agent.lastActivityAt,
        controlToken,
        agent.statusNote ?? null,
        JSON.stringify(agent.links),
        agent.worktree === undefined ? null : JSON.stringify(agent.worktree),
        agent.compareGroup ?? null,
        agent.archivedAt ?? null,
        agent.allowGit ? 1 : 0,
      );
  }

  /**
   * ### setArchived
   *
   * @returns The updated agent.
   * @throws Error When the agent does not exist.
   */
  setArchived(id: string, archived: boolean): Agent {
    const current = this.get(id);
    if (current === undefined) throw new Error(`Unknown agent ${id}`);
    const archivedAt = archived ? Date.now() : undefined;
    this.#db.prepare("UPDATE agents SET archived_at = ? WHERE id = ?").run(archivedAt ?? null, id);
    return { ...current, archivedAt };
  }

  /**
   * ### setWorktreeState
   *
   * @returns The updated agent.
   * @throws Error When the agent does not exist or has no worktree.
   */
  setWorktreeState(id: string, state: Worktree["state"]): Agent {
    const current = this.get(id);
    if (current?.worktree === undefined) throw new Error(`Agent ${id} has no worktree`);
    const worktree = { ...current.worktree, state };
    const lastActivityAt = Date.now();
    this.#db
      .prepare("UPDATE agents SET worktree = ?, last_activity_at = ? WHERE id = ?")
      .run(JSON.stringify(worktree), lastActivityAt, id);
    return { ...current, worktree, lastActivityAt };
  }

  /**
   * ### updateProfile
   *
   * Sets the agent's own status note and/or links, and bumps `lastActivityAt`.
   *
   * @returns The updated agent.
   * @throws Error When the agent does not exist.
   */
  updateProfile(id: string, patch: { statusNote?: string; links?: Array<AgentLink> }): Agent {
    const current = this.get(id);
    if (current === undefined) throw new Error(`Unknown agent ${id}`);
    const next = { ...current, ...patch, lastActivityAt: Date.now() };
    this.#db
      .prepare("UPDATE agents SET status_note = ?, links = ?, last_activity_at = ? WHERE id = ?")
      .run(next.statusNote ?? null, JSON.stringify(next.links), next.lastActivityAt, id);
    return next;
  }

  /**
   * ### get
   *
   * @returns The agent, or `undefined` if no agent has this id.
   */
  get(id: string): Agent | undefined {
    const row = this.#db.prepare("SELECT * FROM agents WHERE id = ?").get(id);
    return row === undefined ? undefined : toAgent(row);
  }

  /**
   * ### list
   *
   * @returns Every agent, oldest first.
   */
  list(): Array<Agent> {
    return this.#db.prepare("SELECT * FROM agents ORDER BY created_at, rowid").all().map(toAgent);
  }

  /**
   * ### update
   *
   * Applies a status and/or session change and bumps `lastActivityAt`.
   *
   * @returns The updated agent.
   * @throws Error When the agent does not exist.
   */
  update(id: string, patch: { status?: AgentStatus; sessionRef?: string }): Agent {
    const current = this.get(id);
    if (current === undefined) throw new Error(`Unknown agent ${id}`);
    this.#db
      .prepare("UPDATE agents SET status = ?, session_ref = ?, last_activity_at = ? WHERE id = ?")
      .run(patch.status ?? current.status, patch.sessionRef ?? current.sessionRef ?? null, Date.now(), id);
    return { ...current, ...patch, lastActivityAt: Date.now() };
  }

  /**
   * ### setAllowGit
   *
   * @returns The updated agent.
   */
  setAllowGit(id: string, allowed: boolean): Agent {
    this.#db.prepare("UPDATE agents SET allow_git = ? WHERE id = ?").run(allowed ? 1 : 0, id);
    const agent = this.get(id);
    if (agent === undefined) throw new Error(`Unknown agent ${id}`);
    return agent;
  }

  /**
   * ### interruptRunning
   *
   * Marks agents left `running` by a previous server process as `interrupted`.
   * Call once at startup, before any turn begins.
   *
   * @returns How many agents were marked.
   */
  interruptRunning(): number {
    const result = this.#db.prepare("UPDATE agents SET status = 'interrupted' WHERE status = 'running'").run();
    return Number(result.changes);
  }

  /**
   * ### countChildren
   *
   * @returns How many agents `parentId` created.
   */
  countChildren(parentId: string): number {
    const row = this.#db.prepare("SELECT COUNT(*) AS n FROM agents WHERE parent_id = ?").get(parentId);
    return Number(row?.n ?? 0);
  }
}
