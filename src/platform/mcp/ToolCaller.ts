/**
 * ### CallOptions
 *
 * Per-call options for {@link ToolCaller.callText}.
 */
export type CallOptions = {
  /** Abandons the call: a queued relay call never starts, a running one is stopped. */
  signal?: AbortSignal;
};

/**
 * ### ToolCaller
 *
 * One tool backend the dashboard can call, independent of how the call is
 * made: a direct MCP connection or a relay through a claude.ai connector.
 */
export type ToolCaller = {
  /** Stable name for caches and error messages. */
  label: string;
  /**
   * ### callText
   *
   * @returns The tool's text output.
   * @throws Error On connection failure, timeout, or a tool-reported error.
   */
  callText: (tool: string, args: Record<string, unknown>, options?: CallOptions) => Promise<string>;
  /**
   * ### describe
   *
   * @returns The tool's description, or `undefined` when the backend cannot
   *   provide descriptions or does not list the tool.
   */
  describe: (tool: string) => Promise<string | undefined>;
};

/**
 * ### withSignal
 *
 * @returns `caller` with `signal` applied to every call, so a deadline set
 *   by the dashboard reaches the backend instead of only racing it.
 */
export function withSignal(caller: ToolCaller, signal: AbortSignal): ToolCaller {
  return { ...caller, callText: (tool, args, options) => caller.callText(tool, args, { signal, ...options }) };
}

/**
 * ### ToolNotFoundError
 *
 * The tool answered that the requested item does not exist (or is not
 * visible to you). Detail routes answer 404 for it; any other tool error is
 * a 502, so a setup problem never hides behind "not found".
 */
export class ToolNotFoundError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ToolNotFoundError";
  }
}

/**
 * ### notFoundOn
 *
 * Re-throws a failed tool call as {@link ToolNotFoundError} when its message
 * matches the tool's own not-found text.
 *
 * @param pattern - The tool's not-found wording, e.g. `/Item not found/i` for Nuclino.
 */
export async function notFoundOn<T>(call: Promise<T>, pattern: RegExp): Promise<T> {
  try {
    return await call;
  } catch (error) {
    if (error instanceof Error && pattern.test(error.message)) throw new ToolNotFoundError(error.message, { cause: error });
    throw error;
  }
}
