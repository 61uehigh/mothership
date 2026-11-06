/**
 * ### AgentTool
 *
 * One tool (or group of tools) a session can use, as listed in its details
 * column: what it is, whether this session may use it, and how often it has.
 */
export type AgentTool = {
  /** Section in the list, e.g. "Files and web" or "MCP servers". */
  group: string;
  name: string;
  description: string;
  available: boolean;
  /** Why it is unavailable, or a caveat such as "sandboxed". */
  note: string | undefined;
  /** Calls recorded in this session's history. */
  uses: number;
};
