import { describe, expect, it } from "vitest";
import { StreamableHTTPError } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { mcpFailureKind } from "@/platform/mcp/mcpFailureKind";

const timeout = new McpError(ErrorCode.RequestTimeout, "Request timed out");

describe("mcpFailureKind", () => {
  it("treats a timeout after connecting as a call that may have gone through", () => {
    expect(mcpFailureKind(timeout, true)).toBe("timed-out");
  });

  it("never treats a timeout while connecting as a call timeout, since the tool was not called", () => {
    expect(mcpFailureKind(timeout, false)).toBe("connection");
  });

  it("keeps a rate limit a rate limit, during connect too", () => {
    expect(mcpFailureKind(new StreamableHTTPError(429, "Too Many Requests"), false)).toBe("rate-limited");
    expect(mcpFailureKind(new StreamableHTTPError(429, "Too Many Requests"), true)).toBe("rate-limited");
  });

  it("treats a closed connection as a connection failure and other protocol errors as rejections", () => {
    expect(mcpFailureKind(new McpError(ErrorCode.ConnectionClosed, "closed"), true)).toBe("connection");
    expect(mcpFailureKind(new McpError(ErrorCode.InvalidParams, "bad"), true)).toBe("rejected");
    expect(mcpFailureKind(new Error("spawn npx ENOENT"), false)).toBe("connection");
  });
});
