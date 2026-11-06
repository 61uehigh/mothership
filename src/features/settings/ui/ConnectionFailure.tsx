"use client";

import type { ReactNode } from "react";
import { ExternalButton } from "@/features/settings/ui/setupSteps";
import { SETTINGS_PRIMARY_BUTTON } from "@/features/settings/ui/settingsLayout";
import type { ConnectionProblem } from "@/features/settings/model/connectionDiagnosis";
import type { UnavailableReason } from "@/features/tools/model/Dashboard";
import type { GoogleOAuthSignInFailureCode } from "@/lib/apiErrorCodes";
import { problemDetail, problemSummary } from "@/shell/connectionProblemText";
import { googleSignInFailureText } from "@/shell/googleSignInFailureText";
import { unavailableText } from "@/shell/unavailableText";
import { CopyButton } from "@/ui/CopyButton";
import { useLocale, useT } from "@/ui/i18n/useT";

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
 * @param tool - The tool's name as the card shows it, for the failure's line.
 * @param unavailable - Why the sidebar can't reach the tool at all; its line replaces the raw error.
 * @param signInFailure - Why the app's own Google sign-in was not kept; worded when the raw error says nothing better.
 */
export function ConnectionFailure({
  message,
  problem,
  tool,
  onSignIn,
  fix,
  unavailable,
  signInFailure,
}: {
  message: string | undefined;
  tool: string;
  problem: ConnectionProblem | undefined;
  unavailable?: UnavailableReason;
  signInFailure?: GoogleOAuthSignInFailureCode;
  onSignIn?: () => void;
  fix?: ReactNode;
}) {
  const t = useT();
  const { locale } = useLocale();
  // A rate limit is a wait, not a breakage: amber, like its chip.
  const waiting = problem?.cause === "rate-limited";
  const signIn =
    onSignIn !== undefined && (problem?.cause === "expired" || problem?.cause === "signin" || problem?.cause === "no-channel" || (problem === undefined && signInFailure !== undefined));
  const fixLabel =
    problem?.url === undefined
      ? undefined
      : problem.cause === "api-disabled"
        ? problem.api === undefined
          ? t("settings.failure.turnOnApi")
          : t("settings.failure.turnOn", { api: problem.api })
        : problem.cause === "mcp-access"
          ? t("settings.failure.turnOnMcp")
          : problem.cause === "scope"
            ? t("settings.slack.openApps")
            : problem.cause === "connector"
              ? t("settings.info.open", { name: "claude.ai" })
              : undefined;
  const detail = problem === undefined ? undefined : problemDetail(t, problem);
  return (
    <div
      role="status"
      className={`flex flex-col gap-1.5 rounded-md border px-2.5 py-2 text-xs ${waiting ? "border-amber-200 bg-amber-50/60 dark:border-amber-950 dark:bg-amber-950/20" : "border-red-200 bg-red-50/60 dark:border-red-950 dark:bg-red-950/20"}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className={`min-w-0 flex-1 ${waiting ? "text-amber-800 dark:text-amber-300" : "text-red-700 dark:text-red-300"}`}>{unavailable !== undefined
            ? unavailableText(t, locale, unavailable)
            : problem !== undefined
              ? problemSummary(t, problem, tool)
              : signInFailure !== undefined
                ? googleSignInFailureText(t, signInFailure)
                : t("settings.failure.unknown")}</p>
        {fixLabel !== undefined && problem?.url !== undefined && (
          <ExternalButton href={problem.url} primary>
            {fixLabel}
          </ExternalButton>
        )}
        {fix}
        {signIn && (
          <button type="button" className={SETTINGS_PRIMARY_BUTTON} onClick={onSignIn}>
            {problem?.cause === "no-channel" ? t("settings.failure.signInOther") : problem?.cause === "expired" ? t("settings.signInAgain") : t("settings.failure.signIn")}
          </button>
        )}
      </div>
      {message !== undefined && (
        <details className="text-zinc-500">
          <summary className="w-fit cursor-pointer select-none hover:text-zinc-800 dark:hover:text-zinc-200">{t("settings.failure.errorDetails")}</summary>
          <div className="mt-1.5 flex flex-col gap-1.5">
            {detail !== undefined && <p className="leading-relaxed">{detail}</p>}
            {problem !== undefined && RETESTED_ON_RETURN.has(problem.cause) && <p>{t("settings.failure.rechecksOnReturn")}</p>}
            <div className="relative">
              <pre className="max-h-48 overflow-auto rounded-md border border-zinc-200 bg-white p-2 pr-10 font-mono text-[11px] break-words whitespace-pre-wrap text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
                {message}
              </pre>
              <CopyButton text={message} what={t("settings.failure.copyWhat")} className="absolute top-1.5 right-1.5" />
            </div>
          </div>
        </details>
      )}
    </div>
  );
}
