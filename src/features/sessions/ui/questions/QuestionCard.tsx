"use client";

import { useState } from "react";
import { relativeTime } from "@/ui/format";
import { formatBinding } from "@/shell/commands/keys";
import { useWorkbench } from "@/shell/WorkbenchContext";
import type { Agent, AgentQuestion } from "@/features/sessions/model/Agent";

const BUTTON =
  "rounded-md border border-zinc-300 px-2.5 py-1 text-xs hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800";

/**
 * ### answerQuestion
 *
 * @param answer - `undefined` dismisses the question without an answer.
 * @returns Whether the server accepted it.
 */
export async function answerQuestion(id: string, answer: string | undefined): Promise<boolean> {
  const response = await fetch(`/api/questions/${id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(answer === undefined ? {} : { answer }),
  });
  return response.ok;
}

/**
 * ### QuestionCard
 *
 * One question from an agent. Open questions show option buttons, a free-text
 * answer, and "close without answering"; resolved ones show the outcome.
 */
export function QuestionCard({
  question,
  agent,
  now,
  selected,
  showAgent,
}: {
  question: AgentQuestion;
  agent: Agent | undefined;
  now: number;
  selected: boolean;
  /** Link to the asking agent; off inside that agent's own panel. */
  showAgent: boolean;
}) {
  const workbench = useWorkbench();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const open = question.status === "open";

  async function submit(answer: string | undefined) {
    setSending(true);
    try {
      if (await answerQuestion(question.id, answer)) setDraft("");
    } finally {
      setSending(false);
    }
  }

  return (
    <article
      data-question={question.id}
      className={`flex flex-col gap-2 rounded-lg border p-3 ${
        open ? "border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/30" : "border-zinc-200 opacity-70 dark:border-zinc-800"
      } ${selected ? "ring-2 ring-teal-500/60" : ""}`}
    >
      <header className="flex items-center gap-2 text-[11px] text-zinc-500">
        {showAgent && (
          <button
            type="button"
            className="font-medium text-zinc-700 hover:underline dark:text-zinc-300"
            onClick={() => workbench.open({ kind: "session", agentId: question.agentId })}
          >
            {agent?.name ?? "Unknown agent"}
          </button>
        )}
        {now > 0 && <span>{relativeTime(question.createdAt, now)}</span>}
        {!open && (
          <span className="ml-auto">{question.status === "answered" ? "Answered" : "Closed without an answer"}</span>
        )}
      </header>
      <p className="whitespace-pre-wrap break-words text-sm">{question.question}</p>

      {open ? (
        <>
          {question.options.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {question.options.map((option, index) => (
                <button
                  key={option}
                  type="button"
                  disabled={sending}
                  className={BUTTON}
                  title={selected && index < 9 ? formatBinding(String(index + 1)) : undefined}
                  onClick={() => void submit(option)}
                >
                  {selected && index < 9 && <kbd className="mr-1 opacity-50">{index + 1}</kbd>}
                  {option}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <textarea
              data-answer-for={question.id}
              rows={1}
              className="min-h-9 flex-1 resize-none rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              placeholder={`Write an answer (${formatBinding("mod+enter")})`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && draft.trim() !== "" && !sending) void submit(draft.trim());
              }}
            />
            <button
              type="button"
              disabled={sending || draft.trim() === ""}
              className="rounded-md bg-teal-600 px-3 text-sm font-medium text-white disabled:opacity-40"
              onClick={() => void submit(draft.trim())}
            >
              Answer
            </button>
          </div>
          <button type="button" disabled={sending} className="self-start text-[11px] text-zinc-500 hover:underline" onClick={() => void submit(undefined)}>
            Close without answering
          </button>
        </>
      ) : (
        question.answer !== undefined && <p className="text-sm text-zinc-600 dark:text-zinc-400">→ {question.answer}</p>
      )}
    </article>
  );
}
