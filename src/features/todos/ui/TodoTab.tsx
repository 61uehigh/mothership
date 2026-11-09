"use client";

import { MessageSquare, NotebookPen, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { addTodo, updateTodo } from "@/shell/todos";
import type { Tab } from "@/shell/tabs";
import { useWorkbench } from "@/shell/workbenchContext";
import { ICON_BUTTON } from "@/ui/iconButtons";
import { TODO_BODY_MAX, TODO_TITLE_MAX, todoTitleFrom, type Todo, type TodoSource } from "@/features/todos/model/Todos";
import { TodoSessionButton } from "@/features/todos/ui/todoSession";
import { useTodos } from "@/features/todos/ui/useTodos";
import { useTodoRun } from "@/features/todos/ui/useTodoRun";
import type { ApiResult } from "@/ui/useJson";
import { useT } from "@/ui/i18n/useT";
import { itemTitle } from "@/ui/i18n/itemTitle";

/** How long typing pauses before it is saved. */
const SAVE_DELAY_MS = 600;

type TodoTabProps = { tab: Extract<Tab, { kind: "todo" }> };

type SaveState = { kind: "idle" | "saving" | "saved" } | { kind: "failed"; error: string };

const DATE_INPUT = "rounded border border-zinc-300 bg-transparent px-1 py-0.5 text-[11px] text-zinc-600 dark:border-zinc-700 dark:text-zinc-300 dark:[color-scheme:dark]";

/** The earliest year a typed date is saved at; typing a year digit by digit passes through 0002, 0020 and 0202 first. */
const FIRST_FULL_YEAR = 1000;

/**
 * The due date field. It keeps its own draft and saves only a whole or
 * cleared date, so a list reload never overwrites what is being typed.
 */
function DueInput({ due, disabled, onCommit }: { due: string | undefined; disabled: boolean; onCommit: (due: string | null) => void }) {
  const [draft, setDraft] = useState(due ?? "");
  const [loaded, setLoaded] = useState(due);
  // A due date changed elsewhere (the list, a reload) replaces the draft.
  if (due !== loaded) {
    setLoaded(due);
    setDraft(due ?? "");
  }
  return (
    <input
      type="date"
      value={draft}
      disabled={disabled}
      onChange={(event) => {
        const value = event.target.value;
        setDraft(value);
        if (value === (due ?? "")) return;
        if (value === "") onCommit(null);
        else if (Number(value.slice(0, 4)) >= FIRST_FULL_YEAR) onCommit(value);
      }}
      className={DATE_INPUT}
    />
  );
}

/** Opens what the to-do came from: its meeting's summary, or the Daily Scrum post in Slack. */
function SourceLink({ source }: { source: TodoSource }) {
  const t = useT();
  const workbench = useWorkbench();
  const [label, Icon, tab]: [string, typeof NotebookPen, Tab] =
    source.kind === "meeting"
      ? [itemTitle(t, source.title), NotebookPen, { kind: "meeting", itemId: source.itemId, title: source.title }]
      : [source.inferred ? t("todos.tab.scrumPostInferred") : t("todos.tab.scrumPost"), MessageSquare, { kind: "slack", url: source.url, title: "Daily Scrum" }];
  return (
    <button type="button" onClick={() => workbench.open(tab)} title={t("todos.tab.openSource", { name: label })} className="flex min-w-0 items-center gap-1 hover:text-zinc-900 dark:hover:text-zinc-100">
      <Icon size={11} aria-hidden className="shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}

/**
 * The editor itself. Holds what you type and saves it a moment after you
 * pause, when you leave the tab, and before a session starts; it never
 * takes the saved copy back, so a list reload can't undo your typing.
 *
 * @param saved - The to-do as last loaded; `undefined` until a new one is first saved.
 * @param onDelete - Deletes the to-do; the tab closes only once it worked. Not called for a to-do never saved.
 */
function TodoEditor({ tab, saved, onDelete }: TodoTabProps & { saved: Todo | undefined; onDelete: () => Promise<ApiResult<unknown>> }) {
  const t = useT();
  const workbench = useWorkbench();
  const [title, setTitle] = useState(saved?.text ?? "");
  const [body, setBody] = useState(saved?.body ?? "");
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const { failure, run } = useTodoRun();
  const id = tab.todoId;
  const typed = useRef({ title, body });
  const persisted = useRef({ exists: saved !== undefined, text: saved?.text ?? "", body: saved?.body ?? "" });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Saves run one after another, so a new to-do is never added twice.
  const queue = useRef<Promise<void>>(Promise.resolve());

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
    queue.current = queue.current.then(async () => {
      const was = persisted.current;
      const { body: nextBody } = typed.current;
      // A cleared title keeps the saved one: a to-do always has a title.
      const text = todoTitleFrom(typed.current.title, nextBody) || was.text;
      if (text === "" || (was.exists && text === was.text && nextBody === was.body)) return;
      setSave({ kind: "saving" });
      const result = was.exists
        ? await updateTodo(id, { ...(text === was.text ? {} : { text }), ...(nextBody === was.body ? {} : { body: nextBody }) })
        : await addTodo({ id, text, body: nextBody });
      if (!result.ok) {
        setSave({ kind: "failed", error: result.error });
        return;
      }
      persisted.current = { exists: true, text, body: nextBody };
      setSave({ kind: "saved" });
    });
  }, [id]);

  // Leaving the tab (or closing it) saves what is still waiting.
  useEffect(
    () => () => {
      if (timer.current !== undefined) flush();
    },
    [flush],
  );

  function edit(next: { title?: string; body?: string }) {
    typed.current = { ...typed.current, ...next };
    if (next.title !== undefined) setTitle(next.title);
    if (next.body !== undefined) setBody(next.body);
    // Writing in a preview tab keeps it open, as in an editor.
    if (workbench.active?.key === `todo:${id}` && workbench.active.preview) workbench.pin(workbench.active.key);
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DELAY_MS);
  }

  const notice =
    save.kind === "failed"
      ? t("todos.tab.notSaved", { error: save.error })
      : save.kind === "saving"
        ? t("todos.tab.saving")
        : saved === undefined && todoTitleFrom(title, body) === ""
          ? t("todos.tab.writeTitleToSave")
          : save.kind === "saved"
            ? t("todos.tab.saved")
            : "";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-zinc-200 px-6 py-2 text-[11px] text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={saved?.done ?? false}
            disabled={saved === undefined}
            onChange={() => saved !== undefined && void run(updateTodo(id, { done: !saved.done }))}
            className="size-3.5 accent-teal-600"
          />
          {t("todos.tab.done")}
        </label>
        <label className="flex items-center gap-1.5">
          {t("todos.tab.due")}
          <DueInput due={saved?.due} disabled={saved === undefined} onCommit={(due) => void run(updateTodo(id, { due }))} />
        </label>
        {saved?.source !== undefined && <SourceLink source={saved.source} />}
        <span className="ml-auto flex items-center gap-3">
          {failure !== undefined && (
            <span role="alert" className="text-red-600 dark:text-red-400">
              {failure}
            </span>
          )}
          <span role="status" className={save.kind === "failed" ? "text-red-600 dark:text-red-400" : "text-zinc-500"}>
            {notice}
          </span>
          <TodoSessionButton todo={saved === undefined ? undefined : { id, text: todoTitleFrom(title, body) || saved.text, body, sessionId: saved.sessionId }} />
          <button
            type="button"
            aria-label={t("todos.tab.deleteThis")}
            title={t("todos.delete")}
            className={ICON_BUTTON}
            onClick={async () => {
              clearTimeout(timer.current);
              timer.current = undefined;
              // A first save still in flight would add the to-do back after the tab closed, so wait for it
              // and ask what was saved, not the list, which learns of the add only after a reload.
              await queue.current;
              const deleted = persisted.current.exists ? await run(onDelete()) : true;
              if (deleted) workbench.close(`todo:${id}`);
              // Still here: save what was typed while it was waiting.
              else flush();
            }}
          >
            <Trash2 size={13} />
          </button>
        </span>
      </header>
      <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-2 px-6 py-5">
        <input
          autoFocus={tab.isNew === true}
          value={title}
          onChange={(event) => edit({ title: event.target.value })}
          onKeyDown={(event) => {
            // Enter goes on to the notes; while composing Korean it only picks the character.
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              document.getElementById(`todo-body-${id}`)?.focus();
            }
          }}
          maxLength={TODO_TITLE_MAX}
          placeholder={t("todos.tab.title")}
          aria-label={t("todos.tab.title")}
          className={`w-full bg-transparent text-xl font-semibold outline-none placeholder:text-zinc-400 ${saved?.done === true ? "text-zinc-500 line-through" : ""}`}
        />
        <textarea
          id={`todo-body-${id}`}
          value={body}
          onChange={(event) => edit({ body: event.target.value })}
          maxLength={TODO_BODY_MAX}
          placeholder={t("todos.tab.notesPlaceholder")}
          aria-label={t("todos.tab.notes")}
          className="min-h-0 w-full flex-1 resize-none bg-transparent text-[14px] leading-6 outline-none placeholder:text-zinc-400"
        />
      </div>
    </div>
  );
}

/**
 * ### TodoTab
 *
 * A to-do opened like a notepad: a title, notes under it, done and due
 * date, and its one session. Saves as you type. A new to-do's tab (from the
 * Todo section's + or the shortcut) adds it once it has a title.
 */
export function TodoTab({ tab }: TodoTabProps) {
  const t = useT();
  const workbench = useWorkbench();
  const { fetched, remove } = useTodos();
  const saved = fetched.data?.find((todo) => todo.id === tab.todoId);

  // Keep the tab's title in step with the saved one, and stop calling it new once it is saved.
  useEffect(() => {
    if (saved !== undefined && (saved.text !== tab.title || tab.isNew === true)) workbench.update({ kind: "todo", todoId: tab.todoId, title: saved.text });
  }, [saved, tab, workbench]);

  // A new to-do needs nothing loaded: its editor shows at once, so typing right after + lands in it.
  if (fetched.data === undefined && tab.isNew !== true) return <p className="p-6 text-sm text-zinc-500">{fetched.error ?? t("todos.reading")}</p>;
  if (saved === undefined && tab.isNew !== true) return <p className="p-6 text-sm text-zinc-500">{t("todos.tab.gone")}</p>;
  return (
    <TodoEditor
      tab={tab}
      saved={saved}
      onDelete={() => remove(tab.todoId)}
    />
  );
}
