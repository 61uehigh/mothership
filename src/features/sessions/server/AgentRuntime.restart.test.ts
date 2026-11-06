import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentEvent } from "@/features/sessions/model/AgentEvents";
import type { AgentRequest } from "@/features/sessions/server/adapters/AgentAdapter";
import { AgentRuntime } from "@/features/sessions/server/AgentRuntime";
import { AgentStore } from "@/features/sessions/server/AgentStore";
import { CONTINUE_NOTE } from "@/features/sessions/model/Restart";

/** What the fake agent does on its next turn; each turn takes the next one. */
const script: Array<(request: AgentRequest) => AsyncGenerator<AgentEvent>> = [];
const prompts: Array<string> = [];

vi.mock("@/features/sessions/server/adapters", () => {
  const run = (request: AgentRequest) => {
    prompts.push(request.prompt);
    const next = script.shift();
    if (next === undefined) throw new Error("No scripted turn");
    return next(request);
  };
  return { ADAPTERS: { claude: { kind: "claude", run }, codex: { kind: "codex", run } } };
});

/** A turn that starts a conversation and then works until it is aborted, as a long task would. */
async function* untilAborted(request: AgentRequest): AsyncGenerator<AgentEvent> {
  yield { type: "session", ref: "conversation-1" };
  if (!request.signal.aborted) await new Promise<void>((resolve) => request.signal.addEventListener("abort", () => resolve()));
}

/** A turn whose agent process is killed from outside, as quitting the app does. */
async function* killedFromOutside(): AsyncGenerator<AgentEvent> {
  yield { type: "session", ref: "conversation-1" };
  yield { type: "error", message: "Claude Code process exited with code 143" };
}

async function* finishes(): AsyncGenerator<AgentEvent> {
  yield { type: "done", output: "Finished", totals: undefined, usage: undefined };
}

const until = async (check: () => boolean) => {
  for (let i = 0; i < 200 && !check(); i++) await new Promise((resolve) => setTimeout(resolve, 10));
  expect(check()).toBe(true);
};

let dir: string;
let store: AgentStore;
/** Every runtime the test made, so their turns can finish before the database closes. */
let runtimes: Array<AgentRuntime>;

function makeRuntime(autoContinue = false): AgentRuntime {
  const runtime = new AgentRuntime({
    store,
    defaultFolder: async () => dir,
    worktreesDir: path.join(dir, "worktrees"),
    baseUrl: "http://127.0.0.1:0",
    environment: { mcpConfig: async () => ({ servers: [], claudeConnectors: new Map(), unavailable: [] }), onRateLimit: () => {}, controlScript: "control.mjs", promptSuggestions: async () => true },
    autoContinue: async () => autoContinue,
  });
  runtimes.push(runtime);
  return runtime;
}

const newSession = (runtime: AgentRuntime, name: string, parentId?: string) =>
  runtime.createAgent({ name, role: undefined, provider: "claude", model: undefined, effort: undefined, parentId, mcp: undefined, initialMessage: undefined, repo: dir, worktree: false, compareGroup: undefined });

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "mothership-restart-"));
  store = new AgentStore(path.join(dir, "mothership.db"));
  script.length = 0;
  prompts.length = 0;
  runtimes = [];
});

afterEach(async () => {
  // A turn still recording its end would use the closed database; Windows cannot delete one that is open.
  for (let i = 0; i < 200 && runtimes.some((runtime) => runtime.runningTurns().length > 0); i++) await new Promise((resolve) => setTimeout(resolve, 10));
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("stopping mothership mid-turn", () => {
  it("lists running turns, records them as stopped by the restart, and starts nothing after", async () => {
    const runtime = makeRuntime();
    const lead = await newSession(runtime, "Release prep");
    const sub = await newSession(runtime, "fix-tests", lead.id);
    script.push(untilAborted);
    runtime.sendMessage(sub.id, "Fix the failing test", lead.id);
    await until(() => runtime.runningTurns().length === 1);
    expect(runtime.runningTurns()).toEqual([{ id: sub.id, name: "fix-tests", lead: "Release prep" }]);

    expect(runtime.shutdown()).toEqual([sub.id]);
    expect(store.agents.get(sub.id)).toMatchObject({ status: "interrupted", stoppedByRestart: true });
    await until(() => runtime.runningTurns().length === 0);
    expect(store.agents.get(sub.id)).toMatchObject({ status: "interrupted", stoppedByRestart: true });
    // No "stopped" report woke the lead up mid-shutdown, and no new turn started.
    expect(store.messages.queuedCounts(lead.id).get(lead.id)).toBeUndefined();
    runtime.sendMessage(lead.id, "Anything", undefined);
    expect(runtime.runningTurns()).toEqual([]);
  });

  it("counts an agent killed with exit code 143 during the shutdown as stopped by the restart, not failed", async () => {
    const runtime = makeRuntime();
    const session = await newSession(runtime, "slow");
    script.push(killedFromOutside);
    runtime.sendMessage(session.id, "Loop and report", undefined);
    // The agent's exit is noticed first; the shutdown signal arrives a moment later.
    setTimeout(() => runtime.shutdown(), 200);
    await until(() => store.agents.get(session.id)?.status === "interrupted");
    expect(store.agents.get(session.id)?.stoppedByRestart).toBe(true);
    expect(store.events.list(session.id).filter((record) => record.event.type === "error")).toEqual([]);
  });

  it("still fails a turn whose agent was killed while mothership keeps running", async () => {
    const runtime = makeRuntime();
    const session = await newSession(runtime, "killed");
    script.push(killedFromOutside);
    runtime.sendMessage(session.id, "Work", undefined);
    await until(() => store.agents.get(session.id)?.status === "failed");
    expect(store.agents.get(session.id)?.stoppedByRestart).toBe(false);
    expect(store.events.list(session.id).map((record) => record.event.type)).toContain("error");
  });

  it("marks turns a crashed server left running as stopped by the restart on the next start", async () => {
    const before = makeRuntime();
    const session = await newSession(before, "crashed");
    store.agents.update(session.id, { status: "running" });
    makeRuntime();
    expect(store.agents.get(session.id)).toMatchObject({ status: "interrupted", stoppedByRestart: true });
  });
});

describe("continuing after a restart", () => {
  it("resumes the lead's conversation and its stopped sub-agent's, which still reports to the lead", async () => {
    const runtime = makeRuntime();
    const lead = await newSession(runtime, "Release prep");
    const sub = await newSession(runtime, "fix-tests", lead.id);
    script.push(untilAborted, untilAborted);
    runtime.sendMessage(lead.id, "Ship the release", undefined);
    runtime.sendMessage(sub.id, "Fix the failing test", lead.id);
    await until(() => store.agents.get(lead.id)?.sessionRef !== undefined && store.agents.get(sub.id)?.sessionRef !== undefined);
    runtime.shutdown();
    await until(() => runtime.runningTurns().length === 0);

    const next = makeRuntime();
    script.push(finishes, finishes, finishes);
    expect(next.continueAfterRestart(lead.id)).toEqual([lead.id, sub.id]);
    await until(() => store.agents.get(sub.id)?.status === "idle" && store.agents.get(lead.id)?.status === "idle");
    expect(store.agents.get(lead.id)?.stoppedByRestart).toBe(false);
    expect(prompts.slice(2, 4).every((prompt) => prompt.includes(CONTINUE_NOTE))).toBe(true);
    // The sub-agent's continued turn came from the lead, so its result was reported back.
    await until(() => store.messages.list(lead.id).some((message) => message.kind === "report" && message.senderId === sub.id));
  });

  it("continues everything a restart stopped on start when auto-continue is on", async () => {
    const runtime = makeRuntime();
    const session = await newSession(runtime, "slow");
    script.push(untilAborted);
    runtime.sendMessage(session.id, "Loop and report", undefined);
    await until(() => store.agents.get(session.id)?.sessionRef !== undefined);
    runtime.shutdown();
    await until(() => runtime.runningTurns().length === 0);

    script.push(finishes);
    makeRuntime(true);
    await until(() => store.agents.get(session.id)?.status === "idle");
    expect(store.messages.list(session.id).at(-1)).toMatchObject({ text: CONTINUE_NOTE, kind: "system" });
  });

  it("continuing a team twice queues each continuation once", async () => {
    const runtime = makeRuntime();
    const lead = await newSession(runtime, "Release prep");
    const sub = await newSession(runtime, "fix-tests", lead.id);
    script.push(untilAborted, untilAborted);
    runtime.sendMessage(lead.id, "Ship the release", undefined);
    runtime.sendMessage(sub.id, "Fix the failing test", lead.id);
    await until(() => runtime.runningTurns().length === 2);
    runtime.shutdown();
    await until(() => runtime.runningTurns().length === 0);

    // Other sessions hold every run slot, so the continuations wait in the queue.
    const next = makeRuntime();
    for (let i = 0; i < 6; i++) {
      const busy = await newSession(next, `busy-${i}`);
      script.push(untilAborted);
      next.sendMessage(busy.id, "Work", undefined);
    }
    await until(() => next.runningTurns().length === 6);
    expect(next.continueAfterRestart(lead.id)).toEqual([lead.id, sub.id]);
    expect(next.continueAfterRestart(lead.id)).toEqual([]);
    expect(store.messages.queuedCounts(lead.id).get(lead.id)).toBe(1);
    expect(store.messages.queuedCounts(sub.id).get(sub.id)).toBe(1);
    next.shutdown();
  });
});

describe("starting mothership", () => {
  it("starts a message that was waiting for a run slot when the app quit, but not one a restart stopped", async () => {
    const before = makeRuntime();
    const waiting = await newSession(before, "waiting");
    const stopped = await newSession(before, "stopped");
    for (const session of [waiting, stopped]) {
      store.messages.insert({ id: `queued-${session.id}`, agentId: session.id, senderId: undefined, kind: "message", text: "Queued", createdAt: Date.now(), deliveredAt: undefined });
    }
    store.agents.update(stopped.id, { status: "interrupted", stoppedByRestart: true });

    script.push(finishes, finishes);
    makeRuntime();
    expect(store.messages.queuedCounts(undefined)).toEqual(new Map([[stopped.id, 1]]));
    await until(() => store.agents.get(waiting.id)?.status === "idle");
  });

  it("keeps the queue of a session a restart stopped waiting for Continue when another turn frees a slot", async () => {
    const runtime = makeRuntime();
    const stopped = await newSession(runtime, "stopped");
    const other = await newSession(runtime, "other");
    store.messages.insert({ id: "queued", agentId: stopped.id, senderId: undefined, kind: "message", text: "Queued", createdAt: Date.now(), deliveredAt: undefined });
    store.agents.update(stopped.id, { status: "interrupted", stoppedByRestart: true });

    script.push(finishes);
    runtime.sendMessage(other.id, "Work", undefined);
    await until(() => store.agents.get(other.id)?.status === "idle" && runtime.runningTurns().length === 0);
    expect(store.messages.queuedCounts(stopped.id).get(stopped.id)).toBe(1);
    expect(store.agents.get(stopped.id)).toMatchObject({ status: "interrupted", stoppedByRestart: true });

    // A new message picks it up, as Continue would.
    script.push(finishes, finishes);
    runtime.sendMessage(stopped.id, "Go on", undefined);
    await until(() => store.messages.queuedCounts(stopped.id).size === 0 && store.agents.get(stopped.id)?.status === "idle" && runtime.runningTurns().length === 0);
    expect(store.agents.get(stopped.id)?.stoppedByRestart).toBe(false);
  });
});
