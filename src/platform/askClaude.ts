import { query } from "@anthropic-ai/claude-agent-sdk";
import type { z } from "zod";
import { claudeExecutable } from "@/platform/agentBinaries";
import { CLAUDE_LOGIN_CODE, isClaudeAuthFailure, noteClaudeAuth } from "@/platform/claudeLogin";
import { HttpError } from "@/platform/http/HttpError";

/**
 * ### askClaudeJson
 *
 * One question to Claude with no tools, answered as JSON. Uses your Claude
 * login or API key, the same as agents.
 *
 * @param what - What is being asked, for error messages, e.g. `Claude's review`.
 * @throws HttpError 401 with code {@link CLAUDE_LOGIN_CODE} when Claude
 *   refuses your login (expired, logged out) or API key.
 * @throws Error When Claude cannot be reached, takes longer than `timeoutMs`,
 *   or does not answer in the shape of `schema`.
 */
export async function askClaudeJson<T>(
  prompt: string,
  schema: z.ZodType<T>,
  options: { what: string; model: "haiku" | "sonnet" | "opus"; timeoutMs: number },
): Promise<T> {
  let answer = "";
  const abortController = new AbortController();
  const timer = setTimeout(() => abortController.abort(), options.timeoutMs);
  try {
    for await (const message of query({
      prompt,
      options: { ...claudeExecutable(), model: options.model, maxTurns: 1, allowedTools: [], permissionMode: "dontAsk", abortController },
    })) {
      if (message.type !== "result") continue;
      if (message.subtype !== "success" || message.is_error) {
        throw new Error(`${options.what} failed: ${message.subtype === "success" ? message.result : message.subtype}`);
      }
      answer = message.result;
    }
  } catch (error) {
    if (abortController.signal.aborted) throw new Error(`${options.what} took too long and was stopped`);
    const text = error instanceof Error ? error.message : String(error);
    if (isClaudeAuthFailure(text)) {
      noteClaudeAuth(true);
      throw new HttpError(`${text}. Log in to Claude again.`, 401, CLAUDE_LOGIN_CODE, { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
  if (abortController.signal.aborted) throw new Error(`${options.what} took too long and was stopped`);
  noteClaudeAuth(false);
  const start = answer.indexOf("{");
  const end = answer.lastIndexOf("}");
  let json: unknown;
  try {
    json = start === -1 || end < start ? undefined : JSON.parse(answer.slice(start, end + 1));
  } catch {
    json = undefined;
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new Error(`${options.what} was not in the expected shape`);
  return parsed.data;
}
