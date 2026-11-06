"use client";

import { LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import type { ConnectionView, GoogleSignInState } from "@/features/settings/model/Settings";
import { ConnectButton, ConnectionShell, DetailRow, DisconnectButton } from "@/features/settings/ui/connectionParts";
import { SetUpClientButton } from "@/features/settings/ui/googleGroupCard";
import { SetupChecklist, SetupStep } from "@/features/settings/ui/setupChecklist";
import { SETTINGS_BUTTON, SETTINGS_PRIMARY_BUTTON } from "@/features/settings/ui/settingsLayout";
import { ExternalButton } from "@/features/settings/ui/setupSteps";
import type { Translate } from "@/ui/i18n/translate";
import { useT } from "@/ui/i18n/useT";
import { fetchJson } from "@/ui/useJson";

const POLL_MS = 1500;

/**
 * ### useGoogleSignIn
 *
 * Starts the sign-in Settings runs for you and follows it until it ends.
 *
 * @param onDone - Called once when a sign-in this card started finishes.
 */
function useGoogleSignIn(onDone: () => void) {
  const [state, setState] = useState<GoogleSignInState>({ state: "idle" });
  const [error, setError] = useState<string | undefined>(undefined);
  const following = useRef(false);
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    // A sign-in may already be waiting, e.g. after reopening Settings.
    void fetchJson<GoogleSignInState>("/api/settings/google/sign-in").then((result) => {
      if (!result.ok) return;
      setState(result.data);
      if (result.data.state === "waiting") following.current = true;
    });
  }, []);

  // Keyed on the state's name, not the answer: a failed poll changes nothing, and polling must go on after one.
  const waiting = state.state === "waiting";
  useEffect(() => {
    if (!waiting) return;
    let stopped = false;
    const timer = setInterval(() => {
      void fetchJson<GoogleSignInState>("/api/settings/google/sign-in").then((result) => {
        if (stopped || !result.ok) return;
        setState(result.data);
        if (result.data.state === "done" && following.current) {
          following.current = false;
          doneRef.current();
        }
      });
    }, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [waiting]);

  async function call(method: "POST" | "DELETE") {
    setError(undefined);
    const result = await fetchJson<GoogleSignInState>("/api/settings/google/sign-in", { method });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    following.current = result.data.state === "waiting";
    setState(result.data);
  }
  return { state, error, start: () => call("POST"), cancel: () => call("DELETE") };
}

/** Why the sign-in or the last call to start or cancel it failed, in the chosen language; the command's own output is shown as it is. */
function signInFailureText(t: Translate, signIn: { state: GoogleSignInState; error: string | undefined }): string | undefined {
  const state = signIn.state;
  if (state.state !== "failed") return signIn.error;
  switch (state.code) {
    case "sign-in-timed-out":
      return t("settings.google.signInTimedOut");
    case "sign-in-not-started":
      return t("settings.google.signInNotStarted", { error: state.output ?? "" });
    case "sign-in-stopped":
      if (state.output !== undefined) return t("settings.google.signInStoppedSaid", { output: state.output });
      return state.exitCode === undefined ? t("settings.google.signInStopped") : t("settings.google.signInStoppedCode", { code: state.exitCode });
  }
}

/**
 * ### GoogleSetup
 *
 * Google Calendar's card in token mode: the shared Google OAuth client
 * (set up on its own card above, which Gmail uses too), turning on the
 * Calendar API, and signing in with Google from here; once signed in, the
 * test row.
 *
 * @param shell - The card frame `ConnectionCard` built: chip, mode control, and its own Details.
 * @param testArea - Test, its result and any failure; shown once setup is done.
 * @param onSignedIn - Called after a sign-in finishes, to refresh and test.
 * @param expired - The last test says the sign-in expired.
 * @param signInRequest - Counts up each time the card asks for a sign-in (e.g. from a failed test).
 * @param onSignOut - Removes the saved Google sign-in (the client file stays); resolves once done.
 * @param signOutError - Why the last sign-out failed, if it did.
 * @param startOpen - Show the steps at once, as after choosing Connect on a card that was off.
 */
export function GoogleSetup({
  connection,
  shell,
  testArea,
  expired,
  signInRequest,
  onSignedIn,
  onSignOut,
  signOutError,
  startOpen = false,
}: {
  connection: ConnectionView;
  shell: Omit<ComponentProps<typeof ConnectionShell>, "children" | "drop">;
  testArea: ReactNode;
  expired: boolean;
  signInRequest: number;
  onSignedIn: () => void;
  onSignOut: () => Promise<void>;
  signOutError: string | undefined;
  startOpen?: boolean;
}) {
  const t = useT();
  const secret = connection.secrets.find((s) => s.name === "GOOGLE_OAUTH_CREDENTIALS");
  const saved = secret?.set === true && secret.problem === undefined;
  const [opened, setOpened] = useState(startOpen);
  const signIn = useGoogleSignIn(onSignedIn);
  const signedIn = connection.signedIn === true && !expired;
  const waiting = signIn.state.state === "waiting";

  const startRef = useRef(signIn.start);
  useEffect(() => {
    startRef.current = signIn.start;
  });
  useEffect(() => {
    if (signInRequest > 0) void startRef.current();
  }, [signInRequest]);

  const complete = saved && signedIn;
  const started = secret?.set === true || connection.signedIn === true || opened;

  const signInControl = <SignInControl signIn={signIn} saved={saved} signedIn={signedIn} everSignedIn={connection.signedIn === true} />;
  const signInFailure = signInFailureText(t, signIn);

  return (
    <ConnectionShell
      {...shell}
      details={
        <>
          <DetailRow label={t("settings.google.oauthClient")}>{saved ? t("settings.google.sharedClient") : t("settings.google.notSavedYet")}</DetailRow>
          {connection.signedIn === true && (
            <DetailRow label={t("settings.google.signIn")}>
              {complete ? signInControl : <DisconnectButton onDisconnect={onSignOut} />}
            </DetailRow>
          )}
          <p>{t("settings.google.testModeNote")}</p>
          {shell.details}
        </>
      }
    >
      {complete && testArea}
      {!complete && !started && <ConnectButton onClick={() => setOpened(true)} />}
      {!complete && started && <CalendarChecklist connection={connection} expired={expired} waiting={waiting} signInControl={signInControl} />}
      {signInFailure !== undefined && <p className="text-xs text-red-600 dark:text-red-400">{signInFailure}</p>}
      {signOutError !== undefined && <p className="text-xs text-red-600 dark:text-red-400">{signOutError}</p>}
    </ConnectionShell>
  );
}

/** The sign-in step's control: Sign in with Google, or the wait for your browser with Cancel. */
function SignInControl({ signIn, saved, signedIn, everSignedIn }: { signIn: ReturnType<typeof useGoogleSignIn>; saved: boolean; signedIn: boolean; everSignedIn: boolean }) {
  const t = useT();
  if (signIn.state.state === "waiting") {
    return (
      <>
        <LoaderCircle size={13} className="animate-spin text-teal-500" aria-hidden />
        <span role="status" className="text-zinc-500">
          {t("settings.google.finishInBrowser")}
        </span>
        {signIn.state.url !== undefined && <ExternalButton href={signIn.state.url}>{t("settings.google.openPageAgain")}</ExternalButton>}
        <button type="button" className={SETTINGS_BUTTON} onClick={() => void signIn.cancel()}>
          {t("ui.cancel")}
        </button>
      </>
    );
  }
  return (
    <button type="button" className={signedIn ? SETTINGS_BUTTON : SETTINGS_PRIMARY_BUTTON} disabled={!saved} onClick={() => void signIn.start()}>
      {everSignedIn ? t("settings.signInAgain") : t("settings.google.signInWithGoogle")}
    </button>
  );
}

/** Calendar's own steps: the shared client, its API, and the sign-in. A step reads as done only once the ones before it are. */
function CalendarChecklist({ connection, expired, waiting, signInControl }: { connection: ConnectionView; expired: boolean; waiting: boolean; signInControl: ReactNode }) {
  const t = useT();
  const secret = connection.secrets.find((s) => s.name === "GOOGLE_OAUTH_CREDENTIALS");
  const saved = secret?.set === true && secret.problem === undefined;
  const signedIn = connection.signedIn === true && !expired;
  return (
    <SetupChecklist>
      <SetupStep
        done={saved}
        label={t("settings.google.setUpClient")}
        hint={t("settings.google.setUpClientHint")}
        below={secret?.problem !== undefined && <span className="text-amber-700 dark:text-amber-400">{t("settings.secret.fileMissing")}</span>}
      >
        {!saved && <SetUpClientButton />}
      </SetupStep>
      <SetupStep done={saved && connection.signedIn === true} label={t("settings.google.turnOnCalendarApi")} hint={t("settings.google.turnOnCalendarApiHint")}>
        <ExternalButton href="https://console.cloud.google.com/apis/library/calendar-json.googleapis.com">{t("settings.info.open", { name: "Calendar API" })}</ExternalButton>
      </SetupStep>
      <SetupStep done={saved && signedIn && !waiting} label={expired ? t("settings.google.signInAgainExpired") : t("settings.google.signInWithGoogle")}>
        {signInControl}
      </SetupStep>
    </SetupChecklist>
  );
}

/**
 * ### GoogleSignInSteps
 *
 * Calendar's Google sign-in steps on their own, for switching a working
 * Calendar to its own sign-in: the client, the Calendar API, and signing in,
 * while the current way keeps working.
 *
 * @param onSignedIn - Called once a sign-in started here finishes.
 */
export function GoogleSignInSteps({ connection, onSignedIn }: { connection: ConnectionView; onSignedIn: () => void }) {
  const secret = connection.secrets.find((s) => s.name === "GOOGLE_OAUTH_CREDENTIALS");
  const saved = secret?.set === true && secret.problem === undefined;
  const signIn = useGoogleSignIn(onSignedIn);
  const signedIn = connection.signedIn === true;
  const t = useT();
  const failure = signInFailureText(t, signIn);
  return (
    <>
      <CalendarChecklist
        connection={connection}
        expired={false}
        waiting={signIn.state.state === "waiting"}
        signInControl={<SignInControl signIn={signIn} saved={saved} signedIn={signedIn} everSignedIn={signedIn} />}
      />
      {failure !== undefined && <p className="text-xs text-red-600 dark:text-red-400">{failure}</p>}
    </>
  );
}
