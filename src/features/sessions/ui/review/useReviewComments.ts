"use client";

import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import { reviewMessage, type ReviewComment } from "@/features/sessions/ui/review/reviewMessage";
import type { DiffLine } from "@/ui/parseDiff";
import { fetchText, jsonRequest } from "@/ui/useJson";

/**
 * ### ReviewComments
 *
 * The review being drafted: line comments, the overall comment, and which
 * line's comment is open for editing.
 */
export type ReviewComments = {
  comments: Array<ReviewComment>;
  /** The `lineId` whose comment box is open. */
  editing: string | undefined;
  setEditing: Dispatch<SetStateAction<string | undefined>>;
  summary: string;
  setSummary: Dispatch<SetStateAction<string>>;
  /** Shown above the review box after sending or merging. */
  notice: string | undefined;
  setNotice: Dispatch<SetStateAction<string | undefined>>;
  /** Why the last send failed; cleared by the next send. */
  sendError: string | undefined;
  /** Replaces the line's comment (blank text removes it) and closes the box. */
  saveComment: (key: string, path: string, line: DiffLine, text: string) => void;
  /** Sends the review to the agent; the draft is cleared only when that succeeds. */
  sendReview: () => Promise<void>;
};

/**
 * ### useReviewComments
 *
 * Drafts a review of the agent's changes and sends it as a message.
 */
export function useReviewComments(agentId: string): ReviewComments {
  const [comments, setComments] = useState<Array<ReviewComment>>([]);
  const [editing, setEditing] = useState<string | undefined>(undefined);
  const [summary, setSummary] = useState("");
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const [sendError, setSendError] = useState<string | undefined>(undefined);

  // Stable, so memoised diff files do not re-render when it is passed down.
  const saveComment = useCallback((key: string, path: string, line: DiffLine, text: string) => {
    setComments((list) => [...list.filter((c) => c.key !== key), ...(text.trim() === "" ? [] : [{ key, path, line, text: text.trim() }])]);
    setEditing(undefined);
  }, []);

  async function sendReview() {
    setSendError(undefined);
    const result = await fetchText(`/api/agents/${agentId}/messages`, jsonRequest("POST", { text: reviewMessage(comments, summary) }));
    if (!result.ok) setSendError(result.error);
    else {
      setComments([]);
      setSummary("");
      setNotice("Review sent. Changes will refresh once the agent applies it.");
    }
  }

  return { comments, editing, setEditing, summary, setSummary, notice, setNotice, sendError, saveComment, sendReview };
}
