import { describe, expect, it } from "vitest";
import { providerRefusal, rolesConfigSchema, rolesForAgents, type ProviderReadiness, type Role } from "@/features/sessions/model/Roles";

const readiness: ProviderReadiness = {
  claude: { ready: true, reason: "login" },
  codex: { ready: false, reason: "not-logged-in", fix: "login" },
};

describe("providerRefusal", () => {
  it("lets ready or unchecked backends through", () => {
    expect(providerRefusal("claude", readiness)).toBeUndefined();
    expect(providerRefusal("codex", {})).toBeUndefined();
  });

  it("says why a backend can't run and which ones can", () => {
    expect(providerRefusal("codex", readiness)).toBe(
      "Codex agents can't run here: No Codex login or API key is set up. Pick a role or provider that runs on Claude.",
    );
  });

  it("tells the agent to ask the human when nothing can run", () => {
    const none: ProviderReadiness = { claude: { ready: false, reason: "not-logged-in" }, codex: { ready: false, reason: "not-logged-in" } };
    expect(providerRefusal("codex", none)).toContain("No backend is set up, so ask the human.");
  });
});

describe("rolesForAgents", () => {
  it("marks roles whose provider can't run", () => {
    const roles: Array<Role> = [
      { name: "researcher", description: "Research", provider: "claude", worktree: false },
      { name: "code_worker", description: "Code", provider: "codex", worktree: true },
    ];
    const marked = rolesForAgents(roles, readiness);
    expect(marked[0]).toMatchObject({ name: "researcher", available: true });
    expect(marked[1]).toMatchObject({ name: "code_worker", available: false, unavailableReason: expect.stringContaining("Codex agents can't run here") });
  });
});

describe("rolesConfigSchema", () => {
  it("moves a role saved for the removed OpenAI agents to Codex, dropping its OpenAI model", () => {
    const parsed = rolesConfigSchema.parse({ roles: { quick_ops: { description: "Lookups", provider: "openai", model: "gpt-5-mini", effort: "low" } } });
    expect(parsed.roles.quick_ops).toMatchObject({ provider: "codex", model: undefined, effort: "low" });
  });
});
