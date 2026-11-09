"use client";

import { Bot, LoaderCircle } from "lucide-react";
import { useShell } from "@/shell/ShellContext";
import { FRAME_BUTTON } from "@/shell/TabFrame";
import { useWorkbenchActions } from "@/shell/WorkbenchContext";
import { ICON_BUTTON } from "@/ui/IconButton";
import { todoSessionMessage, type Todo } from "@/features/todos/model/Todos";
import { todoSessionState, type TodoSessionState } from "@/features/todos/model/todoSession";
import { updateTodo } from "@/features/todos/ui/useTodos";

/** What a to-do's session button needs: the saved to-do, or what its tab holds right now. */
type TodoForSession = Pick<Todo, "id" | "text" | "body" | "sessionId">;

const STATE = {
  "needs-you": { label: "Needs you", dot: "bg-amber-500 animate-pulse" },
  failed: { label: "Failed", dot: "bg-red-500" },
} as const;

/** A session name made from the to-do's title, e.g. `todo-write-the-spec`. */
function sessionName(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
  return slug === "" ? "todo" : `todo-${slug}`;
}

/**
 * ### useTodoSession
 *
 * The one session that belongs to a to-do: its state, and an action that
 * opens it, or starts it (as a lead, through the new-session dialog, with
 * the to-do's title and notes as the first message) when there is none yet
 * or it was deleted. The new session's id is saved on the to-do.
 *
 * @param todo - `undefined` while the to-do is not saved yet: nothing to link.
 */
export function useTodoSession(todo: TodoForSession | undefined) {
  const { agents, questions, connected, openNewAgent } = useShell();
  const workbench = useWorkbenchActions();
  const raw = todoSessionState(todo?.sessionId, agents, questions);
  // Before the live list arrives every session looks deleted; say nothing until it does.
  const state: TodoSessionState | "unknown" = raw === "missing" && !connected ? "unknown" : raw;
  const start = () => {
    if (todo === undefined) return;
    const { id } = todo;
    openNewAgent({ name: sessionName(todo.text), initialMessage: todoSessionMessage(todo) }, (agentId) => void updateTodo(id, { sessionId: agentId }));
  };
  const open = () => {
    if (todo?.sessionId !== undefined && state !== "missing") workbench.open({ kind: "session", agentId: todo.sessionId });
    else start();
  };
  return { state, open };
}

/**
 * ### TodoSessionStatus
 *
 * One small mark for the to-do's session, with its state in the tooltip:
 * a spinner while it works, a colored dot when it needs you or failed, and
 * nothing once it is done or when there is none.
 */
export function TodoSessionStatus({ state }: { state: TodoSessionState | "unknown" }) {
  if (state === "working") return <LoaderCircle size={12} aria-label="Session working" className="shrink-0 animate-spin text-teal-500 dark:text-teal-400" />;
  if (state !== "needs-you" && state !== "failed") return null;
  const { label, dot } = STATE[state];
  return <span role="img" aria-label={`Session: ${label}`} title={`Session: ${label}`} className={`size-2 shrink-0 rounded-full ${dot}`} />;
}

/** The button's words: open the session, or start one. */
function actionLabel(state: TodoSessionState | "unknown"): string {
  if (state === "none") return "Start a session";
  if (state === "missing") return "Start a new session";
  return "Open session";
}

/**
 * ### TodoSessionButton
 *
 * "Open session" for a to-do: starts its session the first time, opens it
 * after that, and offers a new one when it was deleted.
 *
 * @param compact - An icon button, for a list row; otherwise an outlined button with its state.
 */
export function TodoSessionButton({ todo, compact = false }: { todo: TodoForSession | undefined; compact?: boolean }) {
  const { state, open } = useTodoSession(todo);
  const label = actionLabel(state);
  if (compact) {
    return (
      <button type="button" aria-label={todo === undefined ? label : `${label}: "${todo.text}"`} title={label} className={ICON_BUTTON} onClick={open}>
        <Bot size={12} />
      </button>
    );
  }
  return (
    <span className="flex items-center gap-2 text-[11px]">
      <TodoSessionStatus state={state} />
      <button type="button" className={FRAME_BUTTON} disabled={todo === undefined} title={todo === undefined ? "Write a title first" : undefined} onClick={open}>
        <Bot size={13} aria-hidden />
        {label}
      </button>
    </span>
  );
}
