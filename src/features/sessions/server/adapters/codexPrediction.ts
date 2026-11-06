import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable, Writable } from "node:stream";
import readline from "node:readline";
import { PROMPT_SUGGESTION_WAIT_MS } from "@/features/sessions/server/adapters/promptSuggestion";
import { valueAt } from "@/lib/unknownValues";

/**
 * ### CODEX_PREDICTION_PROMPT
 *
 * What a Codex thread is asked, in a sample that is not saved to it, to
 * predict your next message. The Codex app asks its own (server-provided)
 * prompt the same way.
 */
export const CODEX_PREDICTION_PROMPT = [
  "Predict the next message the user is most likely to send in this conversation.",
  "Write it as the user would: in the user's language and voice, as one short instruction or question (one sentence).",
  "Reply with only that message text: no quotes, labels, markdown, or explanation.",
  "If there is no natural next step, reply with nothing.",
].join("\n");

/** Longest suggestion kept; a longer reply is not a next prompt. */
const SUGGESTION_MAX_CHARS = 500;

/**
 * ### cleanSuggestion
 *
 * @returns A sampled reply as a one-line suggestion, or `undefined` when it is empty or too long to be one.
 */
export function cleanSuggestion(text: string | null | undefined): string | undefined {
  const line = (text ?? "")
    .trim()
    .replace(/^["'“‘「]+|["'”’」]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return line === "" || line.length > SUGGESTION_MAX_CHARS ? undefined : line;
}

type RpcMessage ={ id?: number; method?: string; result?: unknown; error?: { message?: string } };

/**
 * ### predictCodexPrompt
 *
 * Asks a finished Codex thread for your likely next message. Starts a short
 * `codex app-server`, loads the thread, and samples it with
 * {@link CODEX_PREDICTION_PROMPT}: the sample reuses the thread's prompt cache
 * and is not added to the conversation. Never throws.
 *
 * @param command - The Codex binary; `args` go before `app-server`.
 * @param threadId - The thread whose last turn just ended.
 * @param env - Variables added to this process's environment for the app server (the turn's secrets).
 * @param signal - Gives up early and stops the app server, e.g. because the agent's next turn starts.
 * @returns The suggestion, or `undefined` when there is none, it failed, `timeoutMs` passed, or `signal` was aborted.
 */
export async function predictCodexPrompt({
  command,
  args = [],
  threadId,
  env,
  signal,
  timeoutMs = PROMPT_SUGGESTION_WAIT_MS,
}: {
  command: string;
  args?: Array<string>;
  threadId: string;
  env: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<string | undefined> {
  if (signal?.aborted) return undefined;
  let server: ChildProcessByStdio<Writable, Readable, null>;
  try {
    server = spawn(command, [...args, "app-server"], { stdio: ["pipe", "pipe", "ignore"], env: { ...process.env, ...env }, windowsHide: true });
  } catch {
    return undefined;
  }
  const pending = new Map<number, { resolve: (result: unknown) => void; reject: (error: Error) => void }>();
  let ended = false;
  const endAll = (reason: string) => {
    ended = true;
    for (const { reject } of pending.values()) reject(new Error(reason));
    pending.clear();
  };
  server.on("error", () => endAll("Codex app server failed to start"));
  server.on("exit", () => endAll("Codex app server exited"));
  server.stdin.on("error", () => endAll("Codex app server closed its input"));
  readline.createInterface({ input: server.stdout }).on("line", (line) => {
    let message: RpcMessage;
    try {
      message = JSON.parse(line) as RpcMessage;
    } catch {
      return;
    }
    if (message.id === undefined || message.method !== undefined) return;
    const waiting = pending.get(message.id);
    if (waiting === undefined) return;
    pending.delete(message.id);
    if (message.error !== undefined) waiting.reject(new Error(message.error.message ?? "Codex app server request failed"));
    else waiting.resolve(message.result);
  });

  let nextId = 0;
  const write = (message: object) => server.stdin.write(`${JSON.stringify(message)}\n`);
  const request = (method: string, params: object) =>
    new Promise<unknown>((resolve, reject) => {
      if (ended) return reject(new Error("Codex app server exited"));
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      write({ id, method, params });
    });

  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const timedOut = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), timeoutMs);
    onAbort = () => resolve(undefined);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
  const predicted = (async () => {
    await request("initialize", { clientInfo: { name: "mothership", version: "1" }, capabilities: { experimentalApi: true } });
    write({ method: "initialized" });
    const resumed = await request("thread/resume", { threadId, initialTurnsPage: { limit: 1 } });
    const turns = valueAt(resumed, "initialTurnsPage", "data");
    const last: unknown = Array.isArray(turns) ? turns[0] : undefined;
    const turnId = valueAt(last, "id");
    if (typeof turnId !== "string" || valueAt(last, "status") === "inProgress") return undefined;
    const sample = await request("thread/sample", { threadId, expectedTurnId: turnId, prompt: CODEX_PREDICTION_PROMPT, disableMcp: true });
    const text = valueAt(sample, "text");
    return cleanSuggestion(typeof text === "string" ? text : undefined);
  })().catch(() => undefined);
  try {
    return await Promise.race([predicted, timedOut]);
  } finally {
    clearTimeout(timer);
    if (onAbort !== undefined) signal?.removeEventListener("abort", onAbort);
    // A wrapper script the kill does not pass on to Codex (a `codex` found on PATH may be one) ends when its input closes.
    server.stdin.end();
    server.kill();
  }
}
