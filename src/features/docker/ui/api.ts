"use client";

import { useEffect, useSyncExternalStore } from "react";
import { fetchText, useJson, type Fetched } from "@/ui/useJson";
import type { ContainerAction, ContainerState, ContainerSummary, DockerErrorCode } from "@/features/docker/model/Docker";

async function postContainerAction(id: string, action: ContainerAction): Promise<string | undefined> {
  const result = await fetchText<DockerErrorCode>(`/api/docker/containers/${encodeURIComponent(id)}/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
  return result.ok ? undefined : result.error;
}

/**
 * ### actionsFor
 *
 * The actions offered for a container in `state`.
 */
export function actionsFor(state: ContainerState): Array<ContainerAction> {
  switch (state) {
    case "running":
      return ["restart", "stop"];
    case "restarting":
      return ["stop"];
    case "created":
    case "exited":
    case "dead":
      return ["start"];
    case "paused":
    case "removing":
      return [];
  }
}

/**
 * ### STATE_DOT
 *
 * Status dot color for each container state.
 */
export const STATE_DOT: Record<ContainerState, string> = {
  running: "bg-green-500",
  created: "bg-zinc-400 dark:bg-zinc-500",
  exited: "bg-zinc-400 dark:bg-zinc-500",
  removing: "bg-zinc-400 dark:bg-zinc-500",
  restarting: "bg-amber-400 animate-pulse",
  paused: "bg-amber-400",
  dead: "bg-red-500",
};

/**
 * ### useContainers
 *
 * The container list from `/api/docker/containers`, refetched every
 * `pollMs` while given.
 *
 * @param pollMs - `undefined` pauses polling (e.g. while the pane is folded).
 */
export function useContainers(pollMs: number | undefined): Fetched<{ containers: Array<ContainerSummary> }, DockerErrorCode> {
  return useJson<{ containers: Array<ContainerSummary> }, DockerErrorCode>("/api/docker/containers", { pollMs });
}

/**
 * ### ContainerActions
 *
 * Shared state of container actions; see {@link useContainerActions}.
 */
export type ContainerActions = {
  /** Container id with an action in flight. */
  busy: string | undefined;
  /** Container id waiting for the user to confirm a stop. */
  confirming: string | undefined;
  /** The last failed action and its message. */
  error: { id: string; message: string } | undefined;
};

const IDLE: ContainerActions = { busy: undefined, confirming: undefined, error: undefined };
const CONFIRM_TIMEOUT_MS = 6_000;

// One store for the whole page, so the sidebar and a container's tab never act on a container at the same time.
let actionState = IDLE;
let confirmTimer: ReturnType<typeof setTimeout> | undefined;
const stateListeners = new Set<() => void>();
const doneListeners = new Set<() => void>();

function setActionState(next: Partial<ContainerActions>): void {
  actionState = { ...actionState, ...next };
  for (const listener of stateListeners) listener();
}

function subscribeActions(listener: () => void): () => void {
  stateListeners.add(listener);
  return () => {
    stateListeners.delete(listener);
  };
}

function requestAction(id: string, action: ContainerAction): void {
  // One action at a time; the buttons are disabled meanwhile.
  if (actionState.busy !== undefined) return;
  clearTimeout(confirmTimer);
  if (action === "stop" && actionState.confirming !== id) {
    setActionState({ confirming: id });
    // An unanswered confirmation quietly goes away.
    confirmTimer = setTimeout(() => setActionState({ confirming: undefined }), CONFIRM_TIMEOUT_MS);
    return;
  }
  setActionState({ confirming: undefined, busy: id, error: undefined });
  void postContainerAction(id, action).then((message) => {
    setActionState({ busy: undefined, error: message === undefined ? undefined : { id, message } });
    // Every view of the containers refreshes, not only the one that acted.
    for (const listener of doneListeners) listener();
  });
}

function cancelConfirm(): void {
  clearTimeout(confirmTimer);
  setActionState({ confirming: undefined });
}

function clearError(): void {
  setActionState({ error: undefined });
}

/**
 * ### useContainerActions
 *
 * Runs container actions, one at a time across the page, and remembers the
 * last error. The Docker pane and container tabs share this state, so a
 * button pressed in one shows as busy in the other. Stopping takes two
 * steps: `request("stop")` first asks for confirmation (`confirming`), and
 * a second call runs it.
 *
 * @param onDone - Called after any action finishes, wherever it was started; e.g. a reload.
 */
export function useContainerActions(onDone: () => void): ContainerActions & {
  /** Runs `action`, or for a first `stop` asks for confirmation instead. */
  request: (id: string, action: ContainerAction) => void;
  cancel: () => void;
  clearError: () => void;
} {
  const state = useSyncExternalStore(subscribeActions, () => actionState, () => IDLE);

  useEffect(() => {
    doneListeners.add(onDone);
    return () => {
      doneListeners.delete(onDone);
    };
  }, [onDone]);

  return { ...state, request: requestAction, cancel: cancelConfirm, clearError };
}
