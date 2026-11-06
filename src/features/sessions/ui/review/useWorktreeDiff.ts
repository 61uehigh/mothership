"use client";

import { useCallback, useEffect, useState } from "react";
import type { Agent } from "@/features/sessions/model/Agent";
import { parseDiff, type DiffFile } from "@/ui/parseDiff";
import { fetchText } from "@/ui/useJson";

/**
 * ### WorktreeDiff
 *
 * An agent's worktree diff as it was last loaded.
 */
export type WorktreeDiff = {
  /** Undefined until the first load succeeds. */
  files: Array<DiffFile> | undefined;
  /** Why the last load failed; cleared when one succeeds. */
  error: string | undefined;
  /** Loads again; a failure keeps the files from the last success. */
  load: () => Promise<void>;
};

/**
 * ### useWorktreeDiff
 *
 * Loads the agent's worktree diff while the worktree is `active`: once on
 * opening, then again after each finished turn, since a running agent's diff
 * changes under us.
 */
export function useWorktreeDiff(agent: Agent, active: boolean): WorktreeDiff {
  const [files, setFiles] = useState<Array<DiffFile> | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  const load = useCallback(async () => {
    const result = await fetchText(`/api/agents/${agent.id}/diff`);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(undefined);
    setFiles(parseDiff(result.data));
  }, [agent.id]);

  useEffect(() => {
    if (!active || (agent.status === "running" && files !== undefined)) return;
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
    // `files` only marks the first load; its later changes must not reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, agent.status, agent.lastActivityAt, load]);

  return { files, error, load };
}
