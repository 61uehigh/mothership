import { describe, expect, it } from "vitest";
import { CONTINUE_NOTE, continuationPlan, continueMessage, isTerminationExit, restartRoots, sessionsToContinue, turnOutcome } from "@/features/sessions/model/Restart";

describe("isTerminationExit", () => {
  it("recognizes an agent process killed from outside", () => {
    expect(isTerminationExit("Claude Code process exited with code 143")).toBe(true);
    expect(isTerminationExit("process terminated by SIGTERM")).toBe(true);
    expect(isTerminationExit("Codex exited with signal 15")).toBe(true);
  });

  it("leaves real failures alone", () => {
    expect(isTerminationExit("Claude Code process exited with code 1")).toBe(false);
    expect(isTerminationExit("Rate limited, retry after 1430 ms")).toBe(false);
  });
});

describe("turnOutcome", () => {
  it("counts a turn cut off by mothership stopping as stopped by the restart, not failed or stopped by you", () => {
    expect(turnOutcome({ aborted: true, shuttingDown: true, finished: false })).toBe("restart");
    expect(turnOutcome({ aborted: false, shuttingDown: true, finished: false })).toBe("restart");
  });

  it("keeps a turn that finished just before the shutdown", () => {
    expect(turnOutcome({ aborted: false, shuttingDown: true, finished: true })).toBe("done");
  });

  it("tells your stop, a finish, and a failure apart otherwise", () => {
    expect(turnOutcome({ aborted: true, shuttingDown: false, finished: false })).toBe("stopped");
    expect(turnOutcome({ aborted: false, shuttingDown: false, finished: true })).toBe("done");
    expect(turnOutcome({ aborted: false, shuttingDown: false, finished: false })).toBe("failed");
  });
});

describe("continueMessage", () => {
  it("tells a session with a conversation to continue, as its sender, so a sub-agent still reports back", () => {
    expect(continueMessage({ sessionRef: "s1" }, { text: "Fix the tests", senderId: "lead", kind: "message" })).toEqual({ text: CONTINUE_NOTE, senderId: "lead", kind: "message" });
  });

  it("continues a lead as mothership itself", () => {
    expect(continueMessage({ sessionRef: "s1" }, { text: "Fix the tests", senderId: undefined, kind: "message" })).toEqual({ text: CONTINUE_NOTE, senderId: undefined, kind: "system" });
    expect(continueMessage({ sessionRef: "s1" }, { text: "Report", senderId: "sub", kind: "report" })).toEqual({ text: CONTINUE_NOTE, senderId: undefined, kind: "system" });
  });

  it("sends the interrupted message again when the conversation never started", () => {
    expect(continueMessage({ sessionRef: undefined }, { text: "Fix the tests", senderId: "lead", kind: "message" })).toEqual({ text: "Fix the tests", senderId: "lead", kind: "message" });
  });
});

describe("sessionsToContinue and restartRoots", () => {
  const agent = (id: string, parentId: string | undefined, stopped: boolean) => ({ id, parentId, stoppedByRestart: stopped, status: stopped ? ("interrupted" as const) : ("idle" as const) });
  const agents = [
    agent("lead", undefined, true),
    agent("sub", "lead", true),
    agent("done-sub", "lead", false),
    agent("grandchild", "done-sub", true),
    agent("waiting-lead", undefined, false),
    agent("its-sub", "waiting-lead", true),
    agent("other", undefined, false),
  ];

  it("continue a lead together with the sub-agents a restart stopped, parents first", () => {
    expect(sessionsToContinue("lead", agents)).toEqual(["lead", "sub", "grandchild"]);
  });

  it("continue a lead's stopped sub-agents even when the lead itself was only waiting", () => {
    expect(sessionsToContinue("waiting-lead", agents)).toEqual(["its-sub"]);
    expect(sessionsToContinue("other", agents)).toEqual([]);
  });

  it("find the leads to continue after a restart", () => {
    expect(restartRoots(agents)).toEqual(["lead", "waiting-lead"]);
  });

  it("ignore a session stopped by a restart that has run again since", () => {
    expect(sessionsToContinue("x", [{ id: "x", parentId: undefined, stoppedByRestart: true, status: "running" }])).toEqual([]);
  });
});

describe("continuationPlan", () => {
  const agents = [
    { id: "lead", parentId: undefined, stoppedByRestart: true, status: "interrupted" as const },
    { id: "sub", parentId: "lead", stoppedByRestart: true, status: "interrupted" as const },
  ];

  it("only starts a session that already has a message waiting, so its task is not sent twice", () => {
    expect(continuationPlan("lead", agents, new Set(["sub"]))).toEqual([
      { id: "lead", action: "send" },
      { id: "sub", action: "start" },
    ]);
  });

  it("finds nothing once the team has been continued and its restart marks cleared", () => {
    const continued = agents.map((agent) => ({ ...agent, stoppedByRestart: false, status: "idle" as const }));
    expect(continuationPlan("lead", continued, new Set(["lead", "sub"]))).toEqual([]);
  });
});
