import { describe, expect, it } from "vitest";
import { codexSandbox } from "@/features/sessions/server/adapters/codexSandbox";

describe("codexSandbox", () => {
  it("keeps the network off and the sandbox untouched without Allow git", () => {
    expect(codexSandbox(false, ["/repo/.git"])).toEqual({ networkAccessEnabled: false, configOverrides: [] });
  });

  it("never turns the network on without the proxy that limits it to GitHub's hosts", () => {
    const { networkAccessEnabled, configOverrides } = codexSandbox(true, []);
    expect(networkAccessEnabled).toBe(true);
    expect(configOverrides).toEqual([
      "features.network_proxy.enabled=true",
      // Quoted keys: a bare `github.com` would be read as a nested table.
      'features.network_proxy.domains={"github.com"="allow","**.github.com"="allow","**.githubusercontent.com"="allow"}',
    ]);
  });

  it("makes a worktree's own and common git directories writable, once each", () => {
    const { configOverrides } = codexSandbox(true, ["/repo/.git/worktrees/wt", "/repo/.git", "/repo/.git"]);
    expect(configOverrides).toContain('sandbox_workspace_write.writable_roots=["/repo/.git/worktrees/wt","/repo/.git"]');
  });
});
