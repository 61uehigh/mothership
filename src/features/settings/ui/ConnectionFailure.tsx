"use client";

import type { ReactNode } from "react";
import { ExternalButton } from "@/features/settings/ui/SetupSteps";
import { SETTINGS_PRIMARY_BUTTON } from "@/features/settings/ui/settingsLayout";
import type { ConnectionProblem } from "@/features/settings/model/connectionDiagnosis";
import { CopyButton } from "@/ui/CopyButton";

/** Causes whose fix page this card notices you coming back from, and tests again. */
const RETESTED_ON_RETURN = new Set(["api-disabled", "mcp-access"]);

/**
 * ### ConnectionFailure
 *
 * A failed connection test in one line, with the button that fixes it when
 * the error is a known one. More about the cause and the raw error, with a
 * copy button, stay behind Details.
 *
 * @param onSignIn - Starts a sign-in; given only where the card can sign in.
 * @param fix - The card's own fix button for this failure, such as Replace token.
 */
export function ConnectionFailure({
  message,
  problem,
  onSignIn,
  fix,
}: {
  message: string;
  problem: ConnectionProblem | undefined;
  onSignIn?: () => void;
  fix?: ReactNode;
}) {
  const signIn = onSignIn !== undefined && (problem?.cause === "expired" || problem?.cause === "signin" || problem?.cause === "no-channel");
  const fixLabel =
    problem?.url === undefined
      ? undefined
      : problem.cause === "api-disabled"
        ? `Turn on ${problem.api ?? "the API"}`
        : problem.cause === "mcp-access"
          ? "Turn on MCP access"
          : problem.cause === "scope"
            ? "Open your Slack apps"
            : undefined;
  return (
    <div role="status" className="flex flex-col gap-1.5 rounded-md border border-red-200 bg-red-50/60 px-2.5 py-2 text-xs dark:border-red-950 dark:bg-red-950/20">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-red-700 dark:text-red-300">{problem?.summary ?? "The test failed with an error mothership doesn't recognize."}</p>
        {fixLabel !== undefined && problem?.url !== undefined && (
          <ExternalButton href={problem.url} primary>
            {fixLabel}
          </ExternalButton>
        )}
        {fix}
        {signIn && (
          <button type="button" className={SETTINGS_PRIMARY_BUTTON} onClick={onSignIn}>
            {problem?.cause === "no-channel" ? "Sign in with another account" : problem?.cause === "expired" ? "Sign in again" : "Sign in"}
          </button>
        )}
      </div>
      <details className="text-zinc-500">
        <summary className="w-fit cursor-pointer select-none hover:text-zinc-800 dark:hover:text-zinc-200">Details</summary>
        <div className="mt-1.5 flex flex-col gap-1.5">
          {problem?.detail !== undefined && <p className="leading-relaxed">{problem.detail}</p>}
          {problem !== undefined && RETESTED_ON_RETURN.has(problem.cause) && <p>This card checks again when you come back to the app.</p>}
          <div className="relative">
            <pre className="max-h-48 overflow-auto rounded-md border border-zinc-200 bg-white p-2 pr-10 font-mono text-[11px] break-words whitespace-pre-wrap text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
              {message}
            </pre>
            <CopyButton text={message} what="error" className="absolute top-1.5 right-1.5" />
          </div>
        </div>
      </details>
    </div>
  );
}
