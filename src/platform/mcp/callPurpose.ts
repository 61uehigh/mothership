import { AsyncLocalStorage } from "node:async_hooks";
import { processState } from "@/platform/processState";

/**
 * ### CallPurpose
 *
 * Why tool calls are being made, for counting them by source and for
 * letting work you wait on go before work you don't.
 */
export type CallPurpose = {
  /** Shown in the call counts, e.g. `meetings list`, `sidebar`, `search`. */
  source: string;
  /** Nobody is waiting on it (a refresh in the background): it waits behind other calls. */
  background: boolean;
};

const OTHER: CallPurpose = { source: "other", background: false };
// One per process: the gate that reads it may come from another route's copy of this module than the code that set it.
const storage = processState("mcp.callPurpose", () => new AsyncLocalStorage<CallPurpose>());

/**
 * ### withCallPurpose
 *
 * Runs `run` with every tool call it makes, however deep, counted under `purpose`.
 */
export function withCallPurpose<T>(purpose: CallPurpose, run: () => T): T {
  return storage.run(purpose, run);
}

/**
 * ### withDefaultCallPurpose
 *
 * Like {@link withCallPurpose}, unless a caller further out set one: a
 * widget load counts as the sidebar's, but as a connection test when the
 * test asked for it.
 */
export function withDefaultCallPurpose<T>(purpose: CallPurpose, run: () => T): T {
  return storage.getStore() === undefined ? storage.run(purpose, run) : run();
}

/**
 * ### currentCallPurpose
 *
 * @returns The purpose set by the nearest {@link withCallPurpose}, else `other`.
 */
export function currentCallPurpose(): CallPurpose {
  return storage.getStore() ?? OTHER;
}
