import { APPROVAL_ANSWERS, type AgentQuestion } from "@/features/sessions/model/Agent";
import { fetchText, jsonRequest, type ApiResult } from "@/ui/useJson";

/**
 * ### answerQuestion
 *
 * @param answer - `undefined` dismisses the question without an answer.
 */
export function answerQuestion(id: string, answer: string | undefined): Promise<ApiResult<string>> {
  return fetchText(`/api/questions/${id}`, jsonRequest("POST", answer === undefined ? {} : { answer }));
}

/**
 * ### answerChoices
 *
 * @returns The answers the question's buttons (and number keys 1–9) send:
 *   the agent's suggested options, or Allow and Deny for an approval.
 */
export function answerChoices(question: AgentQuestion): Array<string> {
  return question.kind === "approval" ? [APPROVAL_ANSWERS.allow, APPROVAL_ANSWERS.deny] : question.options;
}
