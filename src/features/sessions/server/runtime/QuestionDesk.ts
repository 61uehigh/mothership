import { randomUUID } from "node:crypto";
import type { AgentQuestion, LiveUpdate } from "@/features/sessions/model/Agent";
import type { QuestionRepository } from "@/features/sessions/server/store/QuestionRepository";

/** How every approval question starts; also how leftovers are recognized after a restart. */
const APPROVAL_PREFIX = "Allow this command?\n\n";

/**
 * ### QuestionDeskDeps
 *
 * What {@link QuestionDesk} needs from the runtime around it.
 */
export type QuestionDeskDeps = {
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
  readonly #deps: QuestionDeskDeps;
  /** Open questions that are command approvals; their answers are not sent as messages. */
  readonly #approvals = new Set<string>();

  constructor(deps: QuestionDeskDeps) {
    this.#deps = deps;
    // Approvals left open by a previous server process have no command waiting on them any more.
    for (const question of deps.questions.list()) {
      if (question.status === "open" && question.question.startsWith(APPROVAL_PREFIX)) deps.questions.resolve(question.id, "dismissed", undefined);
    }
  }

  /**
   * ### ask
   *
   * @returns The open question, now in your inbox.
   */
  ask(agentId: string, question: string, options: Array<string>): AgentQuestion {
    const record: AgentQuestion = {
      id: randomUUID(),
      agentId,
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
   * Puts a command that needs approval in front of you as a question
   * (Allow / Deny) and waits for the answer. Stopping the turn denies it and
   * closes the question.
   *
   * @returns Whether you allowed it.
   */
  approve(agentId: string, command: string, signal: AbortSignal): Promise<boolean> {
    const question = this.ask(agentId, `${APPROVAL_PREFIX}${command}`, ["Allow", "Deny"]);
    this.#approvals.add(question.id);
    return new Promise<boolean>((resolve) => {
      const done = (allowed: boolean) => {
        unsubscribe();
        signal.removeEventListener("abort", onAbort);
        resolve(allowed);
      };
      const unsubscribe = this.#deps.subscribe((update) => {
        if (update.type === "question" && update.question.id === question.id && update.question.status !== "open") {
          done(update.question.answer === "Allow");
        }
      });
      const onAbort = () => {
        this.#approvals.delete(question.id);
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
   * @param answer - The answer; `undefined` dismisses the question.
   * @returns The resolved question, or `undefined` when it does not exist or is not open.
   */
  resolve(questionId: string, answer: string | undefined): AgentQuestion | undefined {
    const open = this.#deps.questions.get(questionId);
    if (open === undefined || open.status !== "open") return undefined;
    // Checked before emitting: the emit wakes the waiting command (approve).
    const isApproval = this.#approvals.delete(questionId);
    const question = this.#deps.questions.resolve(questionId, answer === undefined ? "dismissed" : "answered", answer);
    this.#deps.emit({ type: "question", question });
    // An agent whose worktree was merged or discarded cannot take a new turn; the answer is still recorded.
    if (!this.#deps.canTakeWork(question.agentId) || isApproval) return question;
    this.#deps.tell(
      question.agentId,
      answer === undefined
        ? `[Question closed without an answer]\nQuestion: ${question.question}\n\nThe human chose not to answer. Proceed on your own judgment, or ask again only if you truly need to.`
        : `[Answer from the human]\nQuestion: ${question.question}\nAnswer: ${answer}`,
    );
    return question;
  }
}
