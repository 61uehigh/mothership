"use client";

import { useState } from "react";
import { useFormat } from "@/ui/i18n/format";
import { useT } from "@/ui/i18n/useT";
import { formatBinding } from "@/shell/commands/keys";
import { useWorkbenchActions } from "@/shell/workbenchContext";
import { APPROVAL_ANSWERS, type Agent, type AgentQuestion } from "@/features/sessions/model/Agent";
import { answerChoices, answerQuestion } from "@/features/sessions/ui/questions/answers";
import type { Translate } from "@/ui/i18n/translate";

const BUTTON =
  "rounded-md border border-zinc-300 px-2.5 py-1 text-xs hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800";

/** How an answer reads: an approval's answer ids in your language, anything else as written. */
function answerLabel(question: AgentQuestion, answer: string, t: Translate): string {
  if (question.kind !== "approval") return answer;
  return answer === APPROVAL_ANSWERS.allow ? t("sessions.questions.allow") : answer === APPROVAL_ANSWERS.deny ? t("sessions.questions.deny") : answer;
}

/**
 * ### QuestionCard
 *
 * One question from an agent. Open questions show option buttons, a free-text
 * answer, and "close without answering"; an approval shows only Allow and
 * Deny, so nothing typed can deny it by accident. Resolved ones show the outcome.
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
  const t = useT();
  const { relativeTime } = useFormat();
  const workbench = useWorkbenchActions();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const open = question.status === "open";
  const approval = question.kind === "approval";
  const choices = answerChoices(question);

  async function submit(answer: string | undefined) {
    setSending(true);
    setError(undefined);
    const result = await answerQuestion(question.id, answer);
    setSending(false);
    if (result.ok) setDraft("");
    else setError(result.error);
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
            {agent?.name ?? t("sessions.questions.unknownAgent")}
          </button>
        )}
        {now > 0 && <span className="shrink-0 whitespace-nowrap">{relativeTime(question.createdAt, now)}</span>}
        {!open && (
          <span className="ml-auto">{question.status === "answered" ? t("sessions.questions.answered") : t("sessions.questions.closed")}</span>
        )}
      </header>
      {approval && <p className="text-sm font-medium">{t("sessions.questions.approvalTitle")}</p>}
      <p className={`whitespace-pre-wrap break-words text-sm ${approval ? "font-mono text-[13px]" : ""}`}>{question.question}</p>

      {open ? (
        <>
          {choices.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {choices.map((option, index) => (
                <button
                  key={option}
                  type="button"
                  disabled={sending}
                  className={BUTTON}
                  title={selected && index < 9 ? formatBinding(String(index + 1)) : undefined}
                  onClick={() => void submit(option)}
                >
                  {selected && index < 9 && <kbd className="mr-1 opacity-50">{index + 1}</kbd>}
                  {answerLabel(question, option, t)}
                </button>
              ))}
            </div>
          )}
          {!approval && (
            <div className="flex gap-2">
              <textarea
                data-answer-for={question.id}
                rows={1}
                className="min-h-9 flex-1 resize-none rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                placeholder={t("sessions.questions.placeholder", { key: formatBinding("mod+enter") })}
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
                {t("sessions.questions.answer")}
              </button>
            </div>
          )}
          {!approval && (
            <button type="button" disabled={sending} className="self-start text-[11px] text-zinc-500 hover:underline" onClick={() => void submit(undefined)}>
              {t("sessions.questions.close")}
            </button>
          )}
          {error !== undefined && <p className="break-words text-xs text-red-600 dark:text-red-400">{t("sessions.questions.answerFailedWith", { error })}</p>}
        </>
      ) : (
        question.answer !== undefined && <p className="text-sm text-zinc-600 dark:text-zinc-400">→ {answerLabel(question, question.answer, t)}</p>
      )}
    </article>
  );
}
