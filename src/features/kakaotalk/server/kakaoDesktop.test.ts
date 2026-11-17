import { describe, expect, it } from "vitest";
import { missingPermission, scriptOutput } from "@/features/kakaotalk/server/kakaoDesktop";

describe("missingPermission", () => {
  it("tells which permission was refused, so Settings can mark the other one granted", () => {
    expect(missingPermission("execution error: Error: osascript is not allowed assistive access. (-25211)")).toBe("accessibility");
    expect(missingPermission("Not authorized to send Apple events to System Events. (-1743)")).toBe("automation");
    expect(missingPermission("syntax error")).toBeUndefined();
  });
});

describe("scriptOutput", () => {
  it("reads the JSON even after other text, and gives undefined instead of throwing", () => {
    expect(scriptOutput('{"running":true,"opened":false}\n')).toEqual({ running: true, opened: false });
    expect(scriptOutput('warning: deprecated\n{"running":true,"opened":true}')).toEqual({ running: true, opened: true });
    expect(scriptOutput("")).toEqual({});
    expect(scriptOutput("not json")).toBeUndefined();
  });
});
