import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentEvent } from "@/features/sessions/model/AgentEvents";
import type { AgentRequest } from "@/features/sessions/server/adapters/AgentAdapter";
import { AgentRuntime } from "@/features/sessions/server/AgentRuntime";
import { AgentStore } from "@/features/sessions/server/AgentStore";

/** What the fake agent does on its next turn; each turn takes the next one. */
const script: Array<(request: AgentRequest) => AsyncGenerator<AgentEvent>> = [];
/** Every turn's request, so a test can deliver a suggestion later, as the real adapters do. */
const requests: Array<AgentRequest> = [];

vi.mock("@/features/sessions/server/adapters", () => {
  const run = (request: AgentRequest) => {
    requests.push(request);
    const next = script.shift();
    if (next === undefined) throw new Error("No scripted turn");
    return next(request);
  };
  return { ADAPTERS: { claude: { kind: "claude", run }, codex: { kind: "codex", run } } };
});

async function* finishes(): AsyncGenerator<AgentEvent> {
  yield { type: "session", ref: "conversation-1" };
  yield { type: "done", output: "Finished", totals: undefined, usage: undefined };
}

/** A turn that runs until its request says to stop. */
async function* untilAborted(request: AgentRequest): AsyncGenerator<AgentEvent> {
  if (!request.signal.aborted) await new Promise<void>((resolve) => request.signal.addEventListener("abort", () => resolve()));
}

/** Lets a delivered suggestion finish being kept (it reads the setting first). */
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

const until = async (check: () => boolean) => {
  for (let i = 0; i < 200 && !check(); i++) await new Promise((resolve) => setTimeout(resolve, 10));
  expect(check()).toBe(true);
};

let dir: string;
let store: AgentStore;
let runtime: AgentRuntime;
let suggestionsOn: boolean;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "mothership-suggestion-"));
  store = new AgentStore(path.join(dir, "mothership.db"));
  script.length = 0;
  requests.length = 0;
  suggestionsOn = true;
  runtime = new AgentRuntime({
    store,
    defaultFolder: async () => dir,
    worktreesDir: path.join(dir, "worktrees"),
    baseUrl: "http://127.0.0.1:0",
    environment: {
      mcpConfig: async () => ({ servers: [], claudeConnectors: new Map(), unavailable: [] }),
      onRateLimit: () => {},
      controlScript: "control.mjs",
      promptSuggestions: async () => suggestionsOn,
    },
  });
});

afterEach(async () => {
  runtime.shutdown();
  for (let i = 0; i < 200 && runtime.runningTurns().length > 0; i++) await new Promise((resolve) => setTimeout(resolve, 10));
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

const newSession = () =>
  runtime.createAgent({ name: "helper", role: undefined, provider: "claude", model: undefined, effort: undefined, parentId: undefined, mcp: undefined, initialMessage: undefined, repo: dir, worktree: false, compareGroup: undefined });

describe("suggested next prompts", () => {
  it("keeps a suggestion that arrives after the turn ended, and broadcasts it", async () => {
    const session = await newSession();
    const updates: Array<string | undefined> = [];
    runtime.subscribe((update) => {
      if (update.type === "agent" && update.agent.id === session.id) updates.push(update.agent.suggestion);
    });
    script.push(finishes);
    runtime.sendMessage(session.id, "Fix the bug", undefined);
    await until(() => store.agents.get(session.id)?.status === "idle");
    expect(requests[0]?.promptSuggestions).toBe(true);
    requests[0]?.onSuggestion("Now run the tests");
    await until(() => store.agents.get(session.id)?.suggestion === "Now run the tests");
    expect(updates.at(-1)).toBe("Now run the tests");
  });

  it("clears the suggestion when you send a message, and drops one that arrives after", async () => {
    const session = await newSession();
    script.push(finishes, untilAborted);
    runtime.sendMessage(session.id, "Fix the bug", undefined);
    await until(() => store.agents.get(session.id)?.status === "idle");
    requests[0]?.onSuggestion("Now run the tests");
    await settle();
    runtime.sendMessage(session.id, "Commit it", undefined);
    expect(store.agents.get(session.id)?.suggestion).toBeUndefined();
    await until(() => store.agents.get(session.id)?.status === "running");
    // The first turn's suggestion was still on its way: too late now.
    requests[0]?.onSuggestion("Late suggestion");
    await settle();
    expect(store.agents.get(session.id)?.suggestion).toBeUndefined();
  });

  it("clears every shown suggestion when suggestions are turned off, and broadcasts it", async () => {
    const first = await newSession();
    const second = await newSession();
    store.agents.setSuggestion(first.id, "Open a PR");
    store.agents.setSuggestion(second.id, "Run the tests");
    const cleared: Array<string> = [];
    runtime.subscribe((update) => {
      if (update.type === "agent" && update.agent.suggestion === undefined) cleared.push(update.agent.id);
    });
    suggestionsOn = false;
    runtime.clearSuggestions();
    expect(store.agents.get(first.id)?.suggestion).toBeUndefined();
    expect(store.agents.get(second.id)?.suggestion).toBeUndefined();
    expect(cleared.sort()).toEqual([first.id, second.id].sort());
  });

  it("drops a suggestion that arrives after suggestions were turned off", async () => {
    const session = await newSession();
    script.push(finishes);
    runtime.sendMessage(session.id, "Fix the bug", undefined);
    await until(() => store.agents.get(session.id)?.status === "idle");
    suggestionsOn = false;
    requests[0]?.onSuggestion("Now run the tests");
    await settle();
    expect(store.agents.get(session.id)?.suggestion).toBeUndefined();
  });

  it("drops a suggestion on its way when suggestions are turned off, even if it read the setting before", async () => {
    const session = await newSession();
    script.push(finishes);
    runtime.sendMessage(session.id, "Fix the bug", undefined);
    await until(() => store.agents.get(session.id)?.status === "idle");
    requests[0]?.onSuggestion("Now run the tests");
    runtime.clearSuggestions();
    await settle();
    expect(store.agents.get(session.id)?.suggestion).toBeUndefined();
  });

  it("ends the last turn's wait for a suggestion before the next turn resumes the conversation", async () => {
    const session = await newSession();
    let waitEnded = false;
    let endedBeforeNextTurn: boolean | undefined;
    script.push(
      async function* (request) {
        yield* finishes();
        // As the adapters do: the process stays to wait for the suggestion until it is told to stop.
        request.onSuggestionWait(
          new Promise<void>((resolve) =>
            request.suggestionSignal.addEventListener("abort", () => {
              waitEnded = true;
              resolve();
            }),
          ),
        );
      },
      async function* () {
        endedBeforeNextTurn = waitEnded;
        yield* finishes();
      },
    );
    runtime.sendMessage(session.id, "Fix the bug", undefined);
    await until(() => store.agents.get(session.id)?.status === "idle");
    expect(waitEnded).toBe(false);
    runtime.sendMessage(session.id, "Commit it", undefined);
    await until(() => endedBeforeNextTurn !== undefined);
    expect(endedBeforeNextTurn).toBe(true);
  });

  it("ends a wait for a suggestion when the session is stopped", async () => {
    const session = await newSession();
    script.push(async function* (request) {
      yield* finishes();
      request.onSuggestionWait(new Promise<void>((resolve) => request.suggestionSignal.addEventListener("abort", () => resolve())));
    });
    runtime.sendMessage(session.id, "Fix the bug", undefined);
    await until(() => store.agents.get(session.id)?.status === "idle");
    await until(() => requests[0] !== undefined);
    expect(requests[0]?.suggestionSignal.aborted).toBe(false);
    runtime.stop(session.id);
    expect(requests[0]?.suggestionSignal.aborted).toBe(true);
  });

  it("asks for no suggestion when the setting is off", async () => {
    suggestionsOn = false;
    const session = await newSession();
    script.push(finishes);
    runtime.sendMessage(session.id, "Fix the bug", undefined);
    await until(() => store.agents.get(session.id)?.status === "idle");
    expect(requests[0]?.promptSuggestions).toBe(false);
  });

  it("keeps the suggestion across a restart of the store", async () => {
    const session = await newSession();
    store.agents.setSuggestion(session.id, "Open a PR");
    const reopened = new AgentStore(path.join(dir, "mothership.db"));
    expect(reopened.agents.get(session.id)?.suggestion).toBe("Open a PR");
    reopened.close();
  });
});
