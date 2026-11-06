import { describe, expect, it } from "vitest";
import { DEFAULT_LEAD, leadChoiceSchema, leadDefaults, leadLimits, modelChoices, pickLead } from "@/features/sessions/model/Lead";

describe("leadChoiceSchema", () => {
  it("refuses a backend mothership no longer has", () => {
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
  it("a Claude lead lacks nothing; a Codex lead lacks native sub-agents and claude.ai connectors", () => {
    expect(leadLimits("claude")).toEqual([]);
    expect(leadLimits("codex")).toEqual(["subagents", "connectors"]);
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
