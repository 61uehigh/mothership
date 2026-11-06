import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentEvent } from "@/features/sessions/model/AgentEvents";
import type { AgentRequest } from "@/features/sessions/server/adapters/AgentAdapter";
import { AgentRuntime } from "@/features/sessions/server/AgentRuntime";
import { AgentStore } from "@/features/sessions/server/AgentStore";

/** What the fake agent does on its next turn; each turn takes the next one. */
const script: Array<(request: AgentRequest) => AsyncGenerator<AgentEvent>> = [];
const prompts: Array<string> = [];
/** Every turn's request, so a test can deliver a suggestion later, as the real adapters do. */
const requests: Array<AgentRequest> = [];

vi.mock("@/features/sessions/server/adapters", () => {
  const run = (request: AgentRequest) => {
    prompts.push(request.prompt);
    requests.push(request);
    const next = script.shift();
    if (next === undefined) throw new Error("No scripted turn");
    return next(request);
  };
  return { ADAPTERS: { claude: { kind: "claude", run }, codex: { kind: "codex", run } } };
});

async function* finishes(): AsyncGenerator<AgentEvent> {
  yield { type: "done", output: "Finished", totals: undefined, usage: undefined };
}

const until = async (check: () => boolean) => {
  for (let i = 0; i < 200 && !check(); i++) await new Promise((resolve) => setTimeout(resolve, 10));
  expect(check()).toBe(true);
};

const git = (cwd: string, ...args: Array<string>) => execFileSync("git", args, { cwd, stdio: "pipe" });

let dir: string;
let repo: string;
let store: AgentStore;
let runtime: AgentRuntime;

const newSession = (name: string, options: { parentId?: string; repo: string; worktree: boolean }) =>
  runtime.createAgent({ name, role: undefined, provider: "claude", model: undefined, effort: undefined, mcp: undefined, initialMessage: undefined, compareGroup: undefined, parentId: options.parentId, repo: options.repo, worktree: options.worktree });

/** A lead in its own worktree and a sub-agent it started there. */
async function leadWithSubAgent() {
  const lead = await newSession("Release prep", { repo, worktree: true });
  const sub = await newSession("fix-tests", { parentId: lead.id, repo: lead.workingDirectory, worktree: false });
  writeFileSync(path.join(lead.workingDirectory, "notes.txt"), "lead's work\n");
  return { lead, sub };
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "mothership-worktree-"));
  repo = path.join(dir, "repo");
  mkdirSync(repo);
  git(repo, "init", "-b", "main");
  git(repo, "config", "user.name", "Test");
  git(repo, "config", "user.email", "test@example.com");
  writeFileSync(path.join(repo, "README.md"), "hello\n");
  git(repo, "add", "README.md");
  git(repo, "commit", "-m", "Initial commit");
  store = new AgentStore(path.join(dir, "mothership.db"));
  script.length = 0;
  prompts.length = 0;
  requests.length = 0;
  runtime = new AgentRuntime({
    store,
    defaultFolder: async () => repo,
    worktreesDir: path.join(dir, "worktrees"),
    baseUrl: "http://127.0.0.1:0",
    environment: { mcpConfig: async () => ({ servers: [], claudeConnectors: new Map(), unavailable: [] }), onRateLimit: () => {}, controlScript: "control.mjs", promptSuggestions: async () => true },
  });
});

afterEach(async () => {
  // A turn still recording its end would use the closed database; Windows cannot delete one that is open.
  for (let i = 0; i < 200 && runtime.runningTurns().length > 0; i++) await new Promise((resolve) => setTimeout(resolve, 10));
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("merging a worktree a sub-agent works in", () => {
  it("starts no turn of the sub-agent while the merge runs, so none works in the folder being removed", async () => {
    const { lead, sub } = await leadWithSubAgent();
    const merge = runtime.merge(lead.id, "Lead's work");
    runtime.sendMessage(sub.id, "Fix the failing test", lead.id);
    expect(runtime.runningTurns()).toEqual([]);

    await merge;
    expect(existsSync(lead.workingDirectory)).toBe(false);
    expect(runtime.runningTurns()).toEqual([]);
    expect(prompts).toEqual([]);
  });

  it("lets the sub-agent's queued turn start once a merge fails", async () => {
    const { lead, sub } = await leadWithSubAgent();
    // Uncommitted tracked changes in the user's checkout make the merge refuse after it has begun.
    writeFileSync(path.join(repo, "README.md"), "edited by hand\n");
    script.push(finishes);
    const merge = runtime.merge(lead.id, "Lead's work");
    runtime.sendMessage(sub.id, "Fix the failing test", lead.id);
    expect(runtime.runningTurns()).toEqual([]);

    await expect(merge).rejects.toThrow(/uncommitted changes/);
    await until(() => prompts.length === 1);
    await until(() => store.agents.get(sub.id)?.status === "idle" && runtime.runningTurns().length === 0);
  });
});

describe("a session that can no longer take work", () => {
  it("has no suggested next prompt once its worktree is merged, not even one still on its way", async () => {
    const { lead, sub } = await leadWithSubAgent();
    let folderLeftWhenWaitEnded: boolean | undefined;
    script.push(async function* (request) {
      yield* finishes();
      // As the adapters do: the process stays in the folder, waiting for the suggestion, until told to stop.
      request.onSuggestionWait(
        new Promise<void>((resolve) =>
          request.suggestionSignal.addEventListener("abort", () => {
            folderLeftWhenWaitEnded = existsSync(lead.workingDirectory);
            resolve();
          }),
        ),
      );
    });
    runtime.sendMessage(lead.id, "Prepare the release", undefined);
    await until(() => store.agents.get(lead.id)?.status === "idle" && runtime.runningTurns().length === 0);
    requests[0]?.onSuggestion("Merge it into main");
    store.agents.setSuggestion(sub.id, "Run the tests again");

    await runtime.merge(lead.id, "Lead's work");
    expect(folderLeftWhenWaitEnded).toBe(true);
    expect(store.agents.get(lead.id)?.suggestion).toBeUndefined();
    expect(store.agents.get(sub.id)?.suggestion).toBeUndefined();
    requests[0]?.onSuggestion("Late suggestion");
    expect(store.agents.get(lead.id)?.suggestion).toBeUndefined();
  });
});

describe("discarding a worktree a sub-agent works in", () => {
  it("starts no turn of the sub-agent while the discard runs", async () => {
    const { lead, sub } = await leadWithSubAgent();
    const discard = runtime.discard(lead.id);
    runtime.sendMessage(sub.id, "Fix the failing test", lead.id);
    expect(runtime.runningTurns()).toEqual([]);

    await discard;
    expect(existsSync(lead.workingDirectory)).toBe(false);
    expect(prompts).toEqual([]);
  });
});
