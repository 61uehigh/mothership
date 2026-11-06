import { describe, expect, it } from "vitest";
import { upsertEnvLine } from "@/features/settings/server/envFile";

describe("upsertEnvLine", () => {
  it("appends a variable to an empty file", () => {
    expect(upsertEnvLine("", "LINEAR_API_KEY", "lin_123")).toBe('LINEAR_API_KEY="lin_123"\n');
  });

  it("replaces the existing line and keeps comments and other variables", () => {
    const text = "# Linear\nLINEAR_API_KEY=\nOTHER=1\n";
    expect(upsertEnvLine(text, "LINEAR_API_KEY", "lin_123")).toBe('# Linear\nLINEAR_API_KEY="lin_123"\nOTHER=1\n');
  });

  it("drops repeated lines for the same variable", () => {
    const text = "A=1\nexport A=2\nB=3";
    expect(upsertEnvLine(text, "A", "x")).toBe('A="x"\nB=3\n');
  });

  it("leaves NAME= when cleared", () => {
    expect(upsertEnvLine('A="x"\n', "A", "")).toBe("A=\n");
  });

  it("does not touch a variable whose name only starts the same", () => {
    expect(upsertEnvLine("AB=1\n", "A", "x")).toBe('AB=1\nA="x"\n');
  });
});
