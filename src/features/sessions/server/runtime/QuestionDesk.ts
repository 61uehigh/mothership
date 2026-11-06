import { randomUUID } from "node:crypto";
import { APPROVAL_ANSWERS, type AgentQuestion, type LiveUpdate } from "@/features/sessions/model/Agent";
import type { QuestionRepository } from "@/features/sessions/server/store/QuestionRepository";
import { HttpError } from "@/platform/http/HttpError";

/**
 * ### QuestionDeskDependencies
 *
 * What {@link QuestionDesk} needs from the runtime around it.
 */
export type QuestionDeskDependencies = {
  questions: QuestionRepository;
  /** Broadcasts a state change to subscribers. */
  emit: (update: LiveUpdate) => void;
  /** Listens to every state change until the returned function is called. */
  subscribe: (listener: (update: LiveUpdate) => void) => () => void;
  /** Whether the agent can take a new turn (its worktree may be merged or discarded). */
  canTakeWork: (agentId: string) => boolean;
  /** Tells the agent the outcome, which starts a new turn for it. */
  tell: (agentId: string, text: string) => void;
};

/**
 * ### QuestionDesk
 *
 * Questions agents put to you, and command approvals that wait on your
 * answer. An ordinary answer goes back to the agent as a message; an
 * approval's answer goes back to the waiting command instead.
 */
export class QuestionDesk {
  readonly #deps: QuestionDeskDependencies;

  constructor(deps: QuestionDeskDependencies) {
    this.#deps = deps;
    // Approvals left open by a previous server process have no command waiting on them any more.
    for (const question of deps.questions.list()) {
      if (question.status === "open" && question.kind === "approval") deps.questions.resolve(question.id, "dismissed", undefined);
    }
  }

  /**
   * ### ask
   *
   * @returns The open question, now in your inbox.
   */
  ask(agentId: string, question: string, options: Array<string>): AgentQuestion {
    return this.#open(agentId, "question", question, options);
  }

  #open(agentId: string, kind: AgentQuestion["kind"], question: string, options: Array<string>): AgentQuestion {
    const record: AgentQuestion = {
      id: randomUUID(),
      agentId,
      kind,
      question,
      options,
      status: "open",
      answer: undefined,
      createdAt: Date.now(),
      resolvedAt: undefined,
    };
    this.#deps.questions.insert(record);
    this.#deps.emit({ type: "question", question: record });
    return record;
  }

  /**
   * ### approve
   *
   * Puts an action that needs approval (a `git push`, publishing an Artifact)
   * in front of you as an approval question (Allow / Deny, shown in your
   * language) and waits for the answer. Stopping the turn denies it and
   * closes the question.
   *
   * @param action - What the agent wants to do, as you will read it.
   * @returns Whether you allowed it.
   */
  approve(agentId: string, action: string, signal: AbortSignal): Promise<boolean> {
    const question = this.#open(agentId, "approval", action, []);
    return new Promise<boolean>((resolve) => {
      const done = (allowed: boolean) => {
        unsubscribe();
        signal.removeEventListener("abort", onAbort);
        resolve(allowed);
      };
      const unsubscribe = this.#deps.subscribe((update) => {
        if (update.type === "question" && update.question.id === question.id && update.question.status !== "open") {
          done(update.question.answer === APPROVAL_ANSWERS.allow);
        }
      });
      const onAbort = () => {
        // Closed without an answer so it does not linger in "Needs you".
        const resolved = this.#deps.questions.resolve(question.id, "dismissed", undefined);
        this.#deps.emit({ type: "question", question: resolved });
        done(false);
      };
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    });
  }

  /**
   * ### resolve
   *
   * Answers or dismisses an open question and tells the asking agent.
   *
   * @param answer - The answer; `undefined` dismisses the question. An
   *   approval takes only one of {@link APPROVAL_ANSWERS}.
   * @returns The resolved question, or `undefined` when it does not exist or is not open.
   * @throws {@link HttpError} 400 when an approval gets any other answer, so a typed "yes" never denies by accident.
   */
  resolve(questionId: string, answer: string | undefined): AgentQuestion | undefined {
    const open = this.#deps.questions.get(questionId);
    if (open === undefined || open.status !== "open") return undefined;
    if (open.kind === "approval" && answer !== undefined && answer !== APPROVAL_ANSWERS.allow && answer !== APPROVAL_ANSWERS.deny) {
      throw new HttpError(`An approval is answered with "${APPROVAL_ANSWERS.allow}" or "${APPROVAL_ANSWERS.deny}"`, 400);
    }
    const question = this.#deps.questions.resolve(questionId, answer === undefined ? "dismissed" : "answered", answer);
    // For an approval this wakes the waiting command (approve), which is told instead of the agent.
    this.#deps.emit({ type: "question", question });
    // An agent whose worktree was merged or discarded cannot take a new turn; the answer is still recorded.
    if (!this.#deps.canTakeWork(question.agentId) || question.kind === "approval") return question;
    this.#deps.tell(
      question.agentId,
      answer === undefined
        ? `[Question closed without an answer]\nQuestion: ${question.question}\n\nThe human chose not to answer. Proceed on your own judgment, or ask again only if you truly need to.`
        : `[Answer from the human]\nQuestion: ${question.question}\nAnswer: ${answer}`,
    );
    return question;
  }
}
