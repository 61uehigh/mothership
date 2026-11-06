import type { Agent, AgentMessage, AgentQuestion, LiveUpdate } from "@/features/sessions/model/Agent";

/** Receives one live update from the server. */
export type LiveListener = (update: LiveUpdate) => void;

/**
 * ### LiveAgents
 *
 * Client-side mirror of the server's agents and messages, kept current over SSE.
 */
export type LiveAgents = {
  /** Every agent, oldest first. */
  agents: Array<Agent>;
  /** Every message, oldest first. */
  messages: Array<AgentMessage>;
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
