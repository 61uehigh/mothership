import { describe, expect, it } from "vitest";
import { checksSchema, summarizeChecks } from "@/features/github/server/ghSchemas";

function run(status: string, conclusion: string | null = null) {
  return { __typename: "CheckRun", name: "build", workflowName: "CI", status, conclusion, detailsUrl: null };
}

function context(state: string) {
  return { __typename: "StatusContext", context: "ci/legacy", state, targetUrl: "https://ci.example/1" };
}

function outcomes(raw: Array<unknown>) {
  return checksSchema.parse(raw).map((check) => check.outcome);
}

describe("checksSchema", () => {
  it("counts a check run as pending until it completes, whatever its conclusion", () => {
    expect(outcomes([run("IN_PROGRESS"), run("QUEUED"), run("IN_PROGRESS", "FAILURE")])).toEqual(["pending", "pending", "pending"]);
  });

  it("reads every failing conclusion of a completed run as a failure, in any case", () => {
    const failing = ["FAILURE", "TIMED_OUT", "ACTION_REQUIRED", "STARTUP_FAILURE", "failure"];
    expect(outcomes(failing.map((c) => run("completed", c)))).toEqual(failing.map(() => "failure"));
  });

  it("reads a completed run that neither passed nor failed as neutral", () => {
    expect(outcomes([run("COMPLETED", "SKIPPED"), run("COMPLETED", "CANCELLED"), run("COMPLETED", "NEUTRAL"), run("COMPLETED")])).toEqual([
      "neutral",
      "neutral",
      "neutral",
      "neutral",
    ]);
  });

  it("reads a commit status by its state, with anything not finished as pending", () => {
    expect(outcomes([context("SUCCESS"), context("FAILURE"), context("error"), context("PENDING"), context("EXPECTED")])).toEqual([
      "success",
      "failure",
      "failure",
      "pending",
      "pending",
    ]);
  });

  it("gives a pending commit status no conclusion", () => {
    const [pending, done] = checksSchema.parse([context("PENDING"), context("SUCCESS")]);
    expect(pending?.conclusion).toBeUndefined();
    expect(done?.conclusion).toBe("SUCCESS");
  });

  it("reads a missing rollup as no checks", () => {
    expect(checksSchema.parse(null)).toEqual([]);
    expect(checksSchema.parse(undefined)).toEqual([]);
  });
});

describe("summarizeChecks", () => {
  const checks = (...list: Array<unknown>) => checksSchema.parse(list);

  it("fails the rollup when any check failed, even with others still running", () => {
    expect(summarizeChecks(checks(run("IN_PROGRESS"), run("COMPLETED", "FAILURE"), run("COMPLETED", "SUCCESS"))).state).toBe("failure");
  });

  it("keeps the rollup pending while a check runs and none failed", () => {
    expect(summarizeChecks(checks(run("IN_PROGRESS"), run("COMPLETED", "SUCCESS"))).state).toBe("pending");
  });

  it("passes the rollup when nothing failed or runs, neutral checks included", () => {
    const summary = summarizeChecks(checks(run("COMPLETED", "SUCCESS"), run("COMPLETED", "SKIPPED")));
    expect(summary).toEqual({ total: 2, failed: 0, pending: 0, passed: 1, state: "success" });
  });

  it("has no rollup state without checks", () => {
    expect(summarizeChecks([]).state).toBeUndefined();
  });
});
