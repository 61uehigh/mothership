import type { Agent, AgentMessage, AgentQuestion, LiveUpdate } from "@/features/sessions/model/Agent";

/**
 * ### LiveListener
 *
 * Receives one live update from the server.
 */
export type LiveListener = (update: LiveUpdate) => void;

/**
 * ### LiveAgents
 *
 * Client-side mirror of the server's agents and messages, kept current over SSE.
 */
export type LiveAgents = {
  /** Every agent, oldest first. */
  agents: Array<Agent>;
  /** Every message, oldest first, in a store of its own so a new message re-renders only its readers. */
  messages: MessageStore;
  /** Open questions and those resolved in the last day, newest first. */
  questions: Array<AgentQuestion>;
  /** Whether the SSE connection is open. */
  connected: boolean;
  /**
   * ### subscribe
   *
   * Receives raw updates, e.g. events for an open detail panel.
   *
   * @returns Unsubscribe function.
   */
  subscribe: (listener: LiveListener) => () => void;
};

/**
 * ### MessageStore
 *
 * Every agent's messages, read with `useSyncExternalStore(subscribe, get)`.
 * `get` returns the same array until the messages change.
 */
export type MessageStore = {
  get: () => Array<AgentMessage>;
  subscribe: (onChange: () => void) => () => void;
};
