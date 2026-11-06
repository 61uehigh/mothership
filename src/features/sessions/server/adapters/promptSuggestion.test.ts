import { describe, expect, it, vi } from "vitest";
import { awaitPromptSuggestion } from "@/features/sessions/server/adapters/promptSuggestion";

/** What is left of a Claude stream after its result, recording whether it was closed. */
function rest(messages: Array<unknown>, { hang = false } = {}) {
  let closed = false;
  async function* generate() {
    try {
      for (const message of messages) yield message;
      if (hang) await new Promise(() => {});
    } finally {
      closed = true;
    }
  }
  return { stream: generate(), closed: () => closed };
}

describe("awaitPromptSuggestion", () => {
  it("reports the suggestion that follows the result and closes the stream", async () => {
    const { stream, closed } = rest([{ type: "system", subtype: "status" }, { type: "prompt_suggestion", suggestion: "  Run the tests  " }, { type: "system" }], { hang: true });
    const onSuggestion = vi.fn();
    await awaitPromptSuggestion(stream, { onSuggestion, stop: vi.fn() });
    expect(onSuggestion).toHaveBeenCalledWith("Run the tests");
    expect(closed()).toBe(true);
  });

  it("reports nothing for an empty suggestion or a stream that ends without one", async () => {
    const onSuggestion = vi.fn();
    await awaitPromptSuggestion(rest([{ type: "prompt_suggestion", suggestion: "   " }]).stream, { onSuggestion, stop: vi.fn() });
    await awaitPromptSuggestion(rest([{ type: "system" }]).stream, { onSuggestion, stop: vi.fn() });
    expect(onSuggestion).not.toHaveBeenCalled();
  });

  it("stops the agent process when no suggestion comes in time", async () => {
    const stop = vi.fn();
    const onSuggestion = vi.fn();
    await awaitPromptSuggestion(rest([], { hang: true }).stream, { onSuggestion, stop, timeoutMs: 20 });
    expect(stop).toHaveBeenCalledOnce();
    expect(onSuggestion).not.toHaveBeenCalled();
  });

  it("stops the agent process as soon as the wait is aborted", async () => {
    const stop = vi.fn();
    const onSuggestion = vi.fn();
    const controller = new AbortController();
    const waiting = awaitPromptSuggestion(rest([], { hang: true }).stream, { onSuggestion, stop, signal: controller.signal, timeoutMs: 60_000 });
    controller.abort();
    await waiting;
    expect(stop).toHaveBeenCalledOnce();
    expect(onSuggestion).not.toHaveBeenCalled();
  });

  it("treats a stream that fails as having no suggestion", async () => {
    async function* failing(): AsyncGenerator<unknown> {
      yield { type: "system" };
      throw new Error("Claude Code process aborted by user");
    }
    const onSuggestion = vi.fn();
    await expect(awaitPromptSuggestion(failing(), { onSuggestion, stop: vi.fn() })).resolves.toBeUndefined();
    expect(onSuggestion).not.toHaveBeenCalled();
  });
});
