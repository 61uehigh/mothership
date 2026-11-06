import type { AgentQuestion } from "@/features/sessions/model/Agent";

/**
 * ### openQuestionsOldestFirst
 *
 * The questions still waiting for an answer, the one asked first at the
 * front: the order the title bar's banner and the "next question" shortcut
 * walk them in. Live state lists questions newest first.
 */
export function openQuestionsOldestFirst(questions: ReadonlyArray<AgentQuestion>): Array<AgentQuestion> {
  return questions.filter((q) => q.status === "open").sort((a, b) => a.createdAt - b.createdAt);
}
