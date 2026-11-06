"use client";

import { useEffect, useState } from "react";
import { useRemembered } from "@/features/settings/ui/connectionCache";
import { useConnectionTest, useRetestOnFocus } from "@/features/settings/ui/useConnectionTest";
import { diagnoseConnection, type ConnectionProblem } from "@/features/settings/model/connectionDiagnosis";
import { googleSignInChip, signInOutcome, type ConnectionChip } from "@/features/settings/model/connectionStatus";
import { fetchJson, fetchText, useJson, type Fetched } from "@/ui/useJson";
import { usePageVisible } from "@/ui/usePageVisible";
import type { GoogleOAuthSignInFailure, GoogleOAuthSignInFailureCode } from "@/lib/apiErrorCodes";

/** Picks up a sign-in finished in your browser. */
const POLL_MS = 2_000;

/** Where an account card's sign-in stands, as `/api/<service>/status` answers. */
type AccountStatus = {
  state: "unconfigured" | "disconnected" | "expired" | "connected";
  signInError: GoogleOAuthSignInFailure | undefined;
  signInsEnded: number;
};

/**
 * A failed test or sign-in as the card keeps it: the raw message, what it
 * means when known, and for a sign-in the server did not keep, why.
 */
type Failure = { message: string | undefined; problem: ConnectionProblem | undefined; signIn?: GoogleOAuthSignInFailureCode };

/**
 * ### GoogleAccountCard
 *
 * What {@link useGoogleAccountCard} gives a card: the status, the test, the
 * failure to show, and the sign-in actions.
 */
export type GoogleAccountCard<S, T> = {
  status: Fetched<S>;
  /** The latest status, or the one this browser remembers until it loads. */
  data: S | undefined;
  chip: ConnectionChip;
  /** The latest test's failure, else why the last sign-in did not finish. */
  failure: Failure | undefined;
  signedIn: boolean;
  /** Signed in, but Google no longer accepts it. */
  expired: boolean;
  hasClient: boolean;
  /** A sign-in page is open in your browser. */
  waiting: boolean;
  cancelWaiting: () => void;
  test: T | { ok: false; message: string } | "running" | undefined;
  resetTest: () => void;
  runTest: () => Promise<void>;
  signIn: () => void;
  signOut: () => Promise<void>;
  /** Why the last sign-out failed. */
  error: string | undefined;
  setError: (error: string | undefined) => void;
};

/**
 * ### useGoogleAccountCard
 *
 * The shared state of a card for one of the app's own Google sign-ins
 * (Gmail, YouTube Music): polls the status while a sign-in page is open,
 * tests a sign-in that just finished, re-tests on focus after you go turn
 * the API on, and words failures through `diagnoseConnection`.
 *
 * @param service - The routes' segment: `/api/<service>/…` and the `/<service>/connect` page.
 * @param id - The connection's id, as `diagnoseConnection` and the remembered status know it.
 */
export function useGoogleAccountCard<S extends AccountStatus, T extends { ok: true } | { ok: false; message: string }>(
  service: "gmail" | "youtube-music",
  id: "gmail" | "youtube_music",
): GoogleAccountCard<S, T> {
  const visible = usePageVisible();
  const [waiting, setWaiting] = useState(false);
  /** `signInsEnded` when the open sign-in began, so the status from before it does not end the wait. */
  const [endedAtStart, setEndedAtStart] = useState<number | undefined>(undefined);
  const status = useJson<S>(`/api/${service}/status`, { pollMs: waiting && visible ? POLL_MS : undefined, remember: true });
  const [error, setError] = useState<string | undefined>(undefined);
  const data = useRemembered(`${id}.status`, status.data);
  const { test, setTest, run: runTest } = useConnectionTest<T | { ok: false; message: string }>(
    async () => {
      const result = await fetchJson<T>(`/api/${service}/test`, { method: "POST" });
      return result.ok ? result.data : { ok: false, message: result.error };
    },
    () => status.reload(),
  );

  const signedIn = data?.state === "connected" || data?.state === "expired";
  const hasClient = data !== undefined && data.state !== "unconfigured";
  const failedTest = test !== undefined && test !== "running" && !test.ok ? (test as { message: string }).message : undefined;
  const signInError = !waiting ? data?.signInError : undefined;
  const failure: Failure | undefined =
    failedTest !== undefined
      ? { message: failedTest, problem: diagnoseConnection(id, failedTest) }
      : signInError !== undefined
        ? { message: signInError.detail, problem: signInError.detail === undefined ? undefined : diagnoseConnection(id, signInError.detail), signIn: signInError.code }
        : undefined;
  const cause = failure?.problem?.cause;

  // A sign-in finished (or came back refused) in your browser: stop waiting, and check one that worked.
  const liveEnded = status.data?.signInsEnded;
  const outcome = waiting ? signInOutcome(endedAtStart, status.data) : undefined;
  useEffect(() => {
    if (!waiting) return;
    if (endedAtStart === undefined && liveEnded === undefined) return;
    if (endedAtStart !== undefined && outcome === undefined) return;
    const timer = setTimeout(() => {
      // Signed in before the status loaded: the first one to load stands for where things began.
      if (endedAtStart === undefined) return setEndedAtStart(liveEnded);
      setWaiting(false);
      if (outcome === "connected") void runTest();
    }, 0);
    return () => clearTimeout(timer);
  }, [waiting, endedAtStart, liveEnded, outcome, runTest]);
  useRetestOnFocus(cause === "api-disabled", () => void runTest());

  return {
    status,
    data,
    chip: googleSignInChip(data, failure),
    failure,
    signedIn,
    expired: data?.state === "expired" || cause === "expired",
    hasClient,
    waiting,
    cancelWaiting: () => setWaiting(false),
    test,
    resetTest: () => setTest(undefined),
    runTest,
    signIn: () => {
      // A new tab (in the desktop app, your browser); Google comes back to this server.
      window.open(`/${service}/connect`, "_blank", "noopener");
      setError(undefined);
      setTest(undefined);
      setEndedAtStart(status.data?.signInsEnded);
      setWaiting(true);
    },
    signOut: async () => {
      const result = await fetchText(`/api/${service}/connection`, { method: "DELETE" });
      setError(result.ok ? undefined : result.error);
      setTest(undefined);
      status.reload();
    },
    error,
    setError,
  };
}
