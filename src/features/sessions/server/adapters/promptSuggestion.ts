/**
 * ### PROMPT_SUGGESTION_WAIT_MS
 *
 * How long to keep reading an agent's stream after its turn ended, waiting
 * for the predicted next prompt, before giving up on it.
 */
export const PROMPT_SUGGESTION_WAIT_MS = 30_000;

/**
 * ### awaitPromptSuggestion
 *
 * Reads what is left of a Claude stream after its `result` message, in the
 * background, until a `prompt_suggestion` arrives, the stream ends,
 * `timeoutMs` passes, or `signal` is aborted (in the last two cases `stop`
 * ends the agent process). Never throws.
 *
 * @param rest - The stream, positioned after the turn's result.
 * @param onSuggestion - Receives the trimmed suggestion; not called for an empty one.
 * @param stop - Ends the agent process when the wait times out or is aborted.
 * @param signal - Ends the wait early, e.g. because the agent's next turn starts.
 */
export async function awaitPromptSuggestion(
  rest: AsyncIterator<unknown>,
  {
    onSuggestion,
    stop,
    signal,
    timeoutMs = PROMPT_SUGGESTION_WAIT_MS,
  }: { onSuggestion: (suggestion: string) => void; stop: () => void; signal?: AbortSignal; timeoutMs?: number },
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const timedOut = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), timeoutMs);
    onAbort = () => resolve("timeout");
    if (signal?.aborted) onAbort();
    else signal?.addEventListener("abort", onAbort, { once: true });
  });
  try {
    for (;;) {
      const next = await Promise.race([rest.next(), timedOut]);
      if (next === "timeout") {
        stop();
        return;
      }
      if (next.done === true) return;
      const suggestion = suggestionOf(next.value);
      if (suggestion !== undefined) {
        if (suggestion !== "") onSuggestion(suggestion);
        break;
      }
    }
    // The suggestion is the last thing a turn sends; close the stream so the process exits.
    await rest.return?.();
  } catch {
    // The process ended or was stopped: there is simply no suggestion.
  } finally {
    clearTimeout(timer);
    if (onAbort !== undefined) signal?.removeEventListener("abort", onAbort);
  }
}

function suggestionOf(message: unknown): string | undefined {
  if (typeof message !== "object" || message === null) return undefined;
  if (!("type" in message) || message.type !== "prompt_suggestion") return undefined;
  return "suggestion" in message && typeof message.suggestion === "string" ? message.suggestion.trim() : "";
}
