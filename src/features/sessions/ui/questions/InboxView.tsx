"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useShell } from "@/shell/ShellContext";
import { useCommands, type Command } from "@/shell/commands/CommandProvider";
import { answerQuestion, QuestionCard } from "@/features/sessions/ui/questions/QuestionCard";
import { useNow } from "@/ui/useNow";

const CLOCK_TICK_MS = 30_000;

/**
 * ### InboxView
 *
 * Questions agents asked through `ask_human`: open ones oldest first (they
 * have waited longest), then those resolved in the last day.
 */
export function InboxView({ focusId }: { focusId: string | undefined }) {
  const { questions, agents } = useShell();
  const now = useNow(CLOCK_TICK_MS);
  const open = useMemo(() => questions.filter((q) => q.status === "open").sort((a, b) => a.createdAt - b.createdAt), [questions]);
  const resolved = questions.filter((q) => q.status !== "open");
  const agentsById = new Map(agents.map((a) => [a.id, a]));
  // The selected question, by id so it survives the list changing. Opening the
  // tab on another question (`focusId`) selects that one; j/k move from there.
  const [selection, setSelection] = useState({ focusId, id: focusId });
  if (selection.focusId !== focusId) setSelection({ focusId, id: focusId });
  const selectedIndex = open.findIndex((q) => q.id === selection.id);
  const active = selectedIndex === -1 ? 0 : selectedIndex;
  const selected = open[active];

  useEffect(() => {
    if (selected !== undefined) document.querySelector(`[data-question="${selected.id}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  // Commands read the latest render through this ref so they register once.
  const latest = useRef({ open, active, selected });
  useEffect(() => {
    latest.current = { open, active, selected };
  });

  const commands = useMemo<Array<Command>>(() => {
    const move = (delta: number) => {
      const { open: list, active: index } = latest.current;
      if (list.length > 0) {
        const next = list[Math.min(Math.max(index + delta, 0), list.length - 1)];
        setSelection((current) => ({ ...current, id: next.id }));
      }
    };
    const choose = (n: number) => {
      const question = latest.current.selected;
      const option = question?.options[n - 1];
      if (question === undefined || option === undefined) return false;
      void answerQuestion(question.id, option);
    };
    const option = { group: "Inbox", hidden: true } as const;
    // Option buttons show hints for 1–9, so every one of those keys answers.
    const options: Array<Command> = Array.from({ length: 9 }, (_, i) => ({
      ...option,
      id: `inbox-option-${i + 1}`,
      title: `Answer with option ${i + 1}`,
      keys: [String(i + 1)],
      run: () => choose(i + 1),
    }));
    return [
      { id: "inbox-next", title: "Next question", group: "Inbox", keys: ["j"], run: () => move(1) },
      { id: "inbox-prev", title: "Previous question", group: "Inbox", keys: ["k"], run: () => move(-1) },
      {
        id: "inbox-reply",
        title: "Write an answer to the selected question",
        group: "Inbox",
        keys: ["r"],
        run: () => {
          const id = latest.current.selected?.id;
          if (id === undefined) return false;
          document.querySelector<HTMLTextAreaElement>(`[data-answer-for="${id}"]`)?.focus();
        },
      },
      {
        id: "inbox-dismiss",
        title: "Close the selected question without answering",
        group: "Inbox",
        keys: ["shift+x"],
        run: () => {
          const id = latest.current.selected?.id;
          if (id === undefined) return false;
          void answerQuestion(id, undefined);
        },
      },
      ...options,
    ];
  }, []);
  useCommands(commands);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-2xl flex-col gap-3 p-4">
        <h1 className="text-lg font-semibold">Inbox</h1>
        {open.length === 0 ? (
          <p className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
            No questions waiting for an answer.
          </p>
        ) : (
          open.map((q, index) => (
            <QuestionCard key={q.id} question={q} agent={agentsById.get(q.agentId)} now={now} selected={index === active} showAgent />
          ))
        )}
        {resolved.length > 0 && (
          <>
            <h2 className="mt-4 text-sm font-medium text-zinc-500">Recently resolved</h2>
            {resolved.map((q) => (
              <QuestionCard key={q.id} question={q} agent={agentsById.get(q.agentId)} now={now} selected={false} showAgent />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
