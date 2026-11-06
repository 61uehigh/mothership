import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { isRateLimited } from "@/platform/mcp/RateLimitGate";

/**
 * ### McpFailureKind
 *
 * - `rate-limited`: the server refused for too many requests.
 * - `timed-out`: the tool was called and did not answer in time, so a send may have happened.
 * - `rejected`: the server answered with a protocol error; the connection is fine.
 * - `connection`: the connection broke or could not be made.
 */
export type McpFailureKind = "rate-limited" | "timed-out" | "rejected" | "connection";

/**
 * ### mcpFailureKind
 *
 * Classifies a failed MCP request. A timeout counts as `timed-out` only once
 * connected: one during connect (a slow `initialize`, e.g. `npx` still
 * fetching the package) means the tool was never called, so it is a
 * `connection` failure and never reported as a send that may have gone through.
 *
 * @param connected - The connection was made, and the request on it failed.
 */
export function mcpFailureKind(error: unknown, connected: boolean): McpFailureKind {
  if (isRateLimited(error)) return "rate-limited";
  if (!(error instanceof McpError)) return "connection";
  if (error.code === ErrorCode.RequestTimeout) return connected ? "timed-out" : "connection";
  return error.code === ErrorCode.ConnectionClosed ? "connection" : "rejected";
}
