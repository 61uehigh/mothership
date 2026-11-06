import { describe, expect, it } from "vitest";
import { DEFAULT_LEAD, leadChoiceSchema, leadDefaults, leadLabel, leadLimits, modelChoices, pickLead, sameLead } from "@/features/sessions/model/Lead";

describe("lead defaults", () => {
  it("start Claude on Opus at high effort and Codex on its own config", () => {
    expect(DEFAULT_LEAD).toEqual({ provider: "claude", model: "opus", effort: "high" });
    expect(leadDefaults("claude")).toEqual(DEFAULT_LEAD);
    expect(leadDefaults("codex")).toEqual({ provider: "codex", model: undefined, effort: undefined });
  });

  it("refuse a backend mothership no longer has", () => {
    expect(leadChoiceSchema.safeParse({ provider: "codex" }).success).toBe(true);
    expect(leadChoiceSchema.safeParse({ provider: "openai" }).success).toBe(false);
  });
});

describe("pickLead", () => {
  const codex = { provider: "codex" as const, model: "gpt-6.2-sol", effort: "medium" as const };

  it("keeps your saved lead while its backend is ready or not checked yet", () => {
    expect(pickLead(codex, { claude: true, codex: true })).toEqual(codex);
    expect(pickLead(codex, {})).toEqual(codex);
  });

  it("falls back to the first ready backend's defaults when the saved one isn't ready", () => {
    expect(pickLead(codex, { claude: true, codex: false })).toEqual(DEFAULT_LEAD);
    expect(pickLead(DEFAULT_LEAD, { claude: false, codex: true })).toEqual(leadDefaults("codex"));
  });

  it("keeps the saved lead when nothing is ready, so the picker can say why", () => {
    expect(pickLead(codex, { claude: false, codex: false })).toEqual(codex);
  });
});

describe("leadLimits", () => {
  it("lists nothing for Claude and what Codex can't do as a lead", () => {
    expect(leadLimits("claude")).toEqual([]);
    const codex = leadLimits("codex");
    expect(codex).toHaveLength(3);
    expect(codex[0]).toContain("No built-in sub-agents");
    expect(codex[1]).toContain("No Allow git");
    expect(codex[2]).toContain("claude.ai connectors");
  });
});

describe("modelChoices", () => {
  const options = { models: { codex: [{ id: "gpt-6.2-sol", label: "GPT-6.2-Sol" }] } };

  it("adds a model that isn't listed, so the picker can show it", () => {
    expect(modelChoices("codex", options, "gpt-old")).toEqual([...options.models.codex, { id: "gpt-old", label: "gpt-old" }]);
    expect(modelChoices("codex", options, "gpt-6.2-sol")).toEqual(options.models.codex);
    expect(modelChoices("codex", options, undefined)).toEqual(options.models.codex);
    expect(modelChoices("claude", undefined, undefined)).toEqual([]);
  });
});

describe("leadLabel and sameLead", () => {
  it("name the backend, and the model only when one was chosen", () => {
    expect(leadLabel({ provider: "codex", model: undefined })).toBe("Codex");
    expect(leadLabel({ provider: "claude", model: "opus" })).toBe("Claude · opus");
  });

  it("compare backend, model, and effort", () => {
    expect(sameLead(DEFAULT_LEAD, { ...DEFAULT_LEAD })).toBe(true);
    expect(sameLead(DEFAULT_LEAD, { ...DEFAULT_LEAD, effort: undefined })).toBe(false);
  });
});
