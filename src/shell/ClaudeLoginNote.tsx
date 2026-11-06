"use client";

import { SquareTerminal } from "lucide-react";
import { useState } from "react";
import { fetchJson, type ApiFailure } from "@/ui/useJson";

/**
 * ### isClaudeLoginFailure
 *
 * @returns Whether a route failed because Claude refused your login: the
 *   `claude-login` code from `platform/claudeLogin`.
 */
export function isClaudeLoginFailure(failure: ApiFailure<string> | undefined): boolean {
  return failure?.code === "claude-login";
}

/**
 * ### ClaudeLoginNote
 *
 * Where a Claude call failed because your login expired: the error with a
 * button that opens Terminal on `claude auth login`. Once you have logged
 * in, retry the call that failed.
 */
export function ClaudeLoginNote({ error }: { error: string }) {
  const [state, setState] = useState<{ busy: boolean; started: boolean; error: string | undefined }>({ busy: false, started: false, error: undefined });

  async function login() {
    setState({ busy: true, started: false, error: undefined });
    const result = await fetchJson<null>("/api/settings/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "claude-login" }) });
    setState({ busy: false, started: result.ok, error: result.ok ? undefined : result.error });
  }

  return (
    <div className="flex flex-col gap-1.5 text-[13px]">
      <p className="break-words text-red-600 dark:text-red-400">{error}</p>
      <span className="inline-flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={state.busy}
          onClick={() => void login()}
          className="inline-flex items-center gap-1 rounded-md bg-teal-700 px-2 py-0.5 text-[12px] font-medium text-white hover:bg-teal-600 disabled:opacity-50"
        >
          <SquareTerminal size={12} aria-hidden />
          Log in to Claude
        </button>
        {state.started && <span className="text-xs text-zinc-500">Finish in the Terminal window, then try again.</span>}
        {state.error !== undefined && <span className="text-xs text-red-600 dark:text-red-400">{state.error}</span>}
      </span>
    </div>
  );
}
