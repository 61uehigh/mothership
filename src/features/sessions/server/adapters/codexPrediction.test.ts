import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CODEX_PREDICTION_PROMPT, cleanSuggestion, predictCodexPrompt } from "@/features/sessions/server/adapters/codexPrediction";

/**
 * A stand-in for `codex app-server`: answers each JSON-RPC request from
 * FAKE_REPLIES (by method), logs every message it got to FAKE_LOG, and
 * sends a notification first, as the real one does.
 */
const FAKE_SERVER = `
const fs = require("node:fs");
const replies = JSON.parse(process.env.FAKE_REPLIES);
const rl = require("node:readline").createInterface({ input: process.stdin });
rl.on("line", (line) => {
  const message = JSON.parse(line);
  fs.appendFileSync(process.env.FAKE_LOG, line + "\\n");
  if (message.id === undefined) return;
  const reply = replies[message.method];
  if (reply === "hang") return;
  process.stdout.write(JSON.stringify({ method: "thread/status/changed", params: {} }) + "\\n");
  process.stdout.write(JSON.stringify(reply === "error" ? { id: message.id, error: { code: -32601, message: "nope" } } : { id: message.id, result: reply ?? {} }) + "\\n");
});
`;

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "mothership-codex-prediction-"));
  writeFileSync(path.join(dir, "server.cjs"), FAKE_SERVER);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const lastTurn = (status: string) => ({ initialTurnsPage: { data: [{ id: "turn-9", status }] } });

function predict(replies: Record<string, unknown>, timeoutMs = 5000, signal?: AbortSignal) {
  const log = path.join(dir, "log.jsonl");
  writeFileSync(log, "");
  const result = predictCodexPrompt({
    command: process.execPath,
    args: [path.join(dir, "server.cjs")],
    threadId: "thread-1",
    env: { FAKE_REPLIES: JSON.stringify(replies), FAKE_LOG: log },
    signal,
    timeoutMs,
  });
  const sent = () =>
    readFileSync(log, "utf8")
      .split("\n")
      .filter((line) => line !== "")
      .map((line) => JSON.parse(line) as { method: string; params?: Record<string, unknown> });
  return { result, sent };
}

describe("predictCodexPrompt", () => {
  it("loads the thread and samples its last turn with the prediction prompt", async () => {
    const { result, sent } = predict({ "thread/resume": lastTurn("completed"), "thread/sample": { text: "그럼 PR 머지해줘.", sourceTurnId: "turn-9" } });
    expect(await result).toBe("그럼 PR 머지해줘.");
    const messages = sent();
    expect(messages.map((m) => m.method)).toEqual(["initialize", "initialized", "thread/resume", "thread/sample"]);
    expect(messages[0]?.params).toMatchObject({ capabilities: { experimentalApi: true } });
    expect(messages[3]?.params).toEqual({ threadId: "thread-1", expectedTurnId: "turn-9", prompt: CODEX_PREDICTION_PROMPT, disableMcp: true });
  });

  it("does not sample a turn that is still running", async () => {
    const { result, sent } = predict({ "thread/resume": lastTurn("inProgress") });
    expect(await result).toBeUndefined();
    expect(sent().map((m) => m.method)).not.toContain("thread/sample");
  });

  it("gives up quietly when the server refuses, has no text, or never answers", async () => {
    expect(await predict({ "thread/resume": lastTurn("completed"), "thread/sample": "error" }).result).toBeUndefined();
    expect(await predict({ "thread/resume": lastTurn("completed"), "thread/sample": { text: null } }).result).toBeUndefined();
    expect(await predict({ "thread/resume": "hang" }, 200).result).toBeUndefined();
  });

  it("gives up as soon as it is aborted, without waiting for the timeout", async () => {
    const controller = new AbortController();
    const started = Date.now();
    const { result } = predict({ "thread/resume": "hang" }, 5000, controller.signal);
    setTimeout(() => controller.abort(), 50);
    expect(await result).toBeUndefined();
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("gives up quietly when the binary cannot start", async () => {
    await expect(predictCodexPrompt({ command: path.join(dir, "missing-codex"), threadId: "t", env: {} })).resolves.toBeUndefined();
  });
});

describe("cleanSuggestion", () => {
  it("keeps one plain line and drops empty or overlong replies", () => {
    expect(cleanSuggestion('  "Run the tests\nagain"  ')).toBe("Run the tests again");
    expect(cleanSuggestion("「테스트 돌려줘」")).toBe("테스트 돌려줘");
    expect(cleanSuggestion("   ")).toBeUndefined();
    expect(cleanSuggestion(null)).toBeUndefined();
    expect(cleanSuggestion("x".repeat(501))).toBeUndefined();
  });
});
