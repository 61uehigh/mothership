import { describe, expect, it } from "vitest";
import { unavailableParams, unavailableReasonOf, type UnavailableReason } from "@/features/tools/model/Dashboard";

describe("unavailableReasonOf", () => {
  const reasons: Array<UnavailableReason> = [
    { code: "turned-off", kind: "slack", widget: "Team Slack" },
    { code: "not-connected" },
    { code: "no-server", server: "linear" },
    { code: "mcp-config-unreadable", error: "bad indentation" },
    { code: "no-widget", kind: "notion" },
  ];

  it.each(reasons)("reads back the $code reason a route sends as code and params", (reason) => {
    expect(unavailableReasonOf(reason.code, unavailableParams(reason))).toEqual(reason);
  });

  it("is undefined when a fact the wording needs is missing", () => {
    expect(unavailableReasonOf("turned-off", {})).toBeUndefined();
    expect(unavailableReasonOf("turned-off", { widget: "Team Slack" })).toBeUndefined();
    expect(unavailableReasonOf("no-server", { server: 3 })).toBeUndefined();
  });

  it("is undefined for a widget kind that is not a tool", () => {
    expect(unavailableReasonOf("no-widget", { kind: "agents" })).toBeUndefined();
  });

  it("is undefined for codes that are not a tool being unavailable", () => {
    expect(unavailableReasonOf("rate-limited", undefined)).toBeUndefined();
    expect(unavailableReasonOf(undefined, undefined)).toBeUndefined();
  });
});
