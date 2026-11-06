"use client";

import { LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import type { ConnectionView, GoogleSignInState } from "@/features/settings/model/Settings";
import { ConnectButton, ConnectionShell, DetailRow, DisconnectButton, EnvName } from "@/features/settings/ui/ConnectionShell";
import { ChooseClientFile, SavedClientFile } from "@/features/settings/ui/oauthClientFile";
import { SetupChecklist, SetupStep } from "@/features/settings/ui/setupChecklist";
import { SETTINGS_BUTTON, SETTINGS_PRIMARY_BUTTON } from "@/features/settings/ui/settingsLayout";
import { ExternalButton } from "@/features/settings/ui/SetupSteps";
import { isOAuthClientTooLarge, OAUTH_CLIENT_TOO_LARGE, useFileDrop } from "@/features/settings/ui/useFileDrop";
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

  useEffect(() => {
    if (state.state !== "waiting") return;
    const timer = setTimeout(() => {
      void fetchJson<GoogleSignInState>("/api/settings/google/sign-in").then((result) => {
        if (!result.ok) return;
        setState(result.data);
        if (result.data.state === "done" && following.current) {
          following.current = false;
          doneRef.current();
        }
      });
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [state]);

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

/**
 * ### GoogleSetup
 *
 * Google Calendar's card in token mode: a checklist of three Google Cloud
 * steps with direct links, choosing (or dropping) the OAuth client file, and
 * signing in with Google from here; once signed in, the test row. The file
 * goes to the server once and is never shown again; replacing or removing it
 * is under Details.
 *
 * @param shell - The card frame `ConnectionCard` built: chip, mode control, and its own Details.
 * @param testArea - Test, its result and any failure; shown once setup is done.
 * @param onClient - Saves the file's text, or removes it with `null`; resolves to an error message, or `undefined`.
 * @param onSignedIn - Called after a sign-in finishes, to refresh and test.
 * @param expired - The last test says the sign-in expired.
 * @param signInRequest - Counts up each time the card asks for a sign-in (e.g. from a failed test).
 * @param onSignOut - Removes the saved Google sign-in (the client file stays); resolves once done.
 * @param signOutError - Why the last sign-out failed, if it did.
 */
export function GoogleSetup({
  connection,
  shell,
  testArea,
  expired,
  signInRequest,
  onClient,
  onSignedIn,
  onSignOut,
  signOutError,
}: {
  connection: ConnectionView;
  shell: Omit<ComponentProps<typeof ConnectionShell>, "children" | "drop">;
  testArea: ReactNode;
  expired: boolean;
  signInRequest: number;
  onClient: (content: string | null) => Promise<string | undefined>;
  onSignedIn: () => void;
  onSignOut: () => Promise<void>;
  signOutError: string | undefined;
}) {
  const secret = connection.secrets.find((s) => s.name === "GOOGLE_OAUTH_CREDENTIALS");
  const saved = secret?.set === true && secret.problem === undefined;
  const [replacing, setReplacing] = useState(false);
  const [opened, setOpened] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const signIn = useGoogleSignIn(onSignedIn);
  const choosing = !saved || replacing;
  const signedIn = connection.signedIn === true && !expired;
  const waiting = signIn.state.state === "waiting";

  const startRef = useRef(signIn.start);
  useEffect(() => {
    startRef.current = signIn.start;
  });
  useEffect(() => {
    if (signInRequest > 0) void startRef.current();
  }, [signInRequest]);

  async function upload(file: File | undefined) {
    if (file === undefined) return;
    setError(undefined);
    if (isOAuthClientTooLarge(file)) {
      setError(OAUTH_CLIENT_TOO_LARGE);
      return;
    }
    setBusy(true);
    const failure = await onClient(await file.text());
    setBusy(false);
    setError(failure);
    if (failure === undefined) setReplacing(false);
  }

  async function remove() {
    setBusy(true);
    setError(await onClient(null));
    setBusy(false);
  }

  const drop = useFileDrop(choosing, (file) => void upload(file));
  const complete = saved && signedIn && !replacing;
  const started = secret?.set === true || connection.signedIn === true || replacing || opened;

  const signInControl = waiting ? (
    <>
      <LoaderCircle size={13} className="animate-spin text-teal-500" aria-hidden />
      <span role="status" className="text-zinc-500">
        Finish in your browser…
      </span>
      {signIn.state.state === "waiting" && signIn.state.url !== undefined && <ExternalButton href={signIn.state.url}>Open the page again</ExternalButton>}
      <button type="button" className={SETTINGS_BUTTON} onClick={() => void signIn.cancel()}>
        Cancel
      </button>
    </>
  ) : (
    <button type="button" className={signedIn ? SETTINGS_BUTTON : SETTINGS_PRIMARY_BUTTON} disabled={!saved} onClick={() => void signIn.start()}>
      {connection.signedIn === true ? "Sign in again" : "Sign in with Google"}
    </button>
  );
  const signInFailure = signIn.state.state === "failed" ? signIn.state.message : signIn.error;

  return (
    <ConnectionShell
      {...shell}
      drop={drop}
      details={
        <>
          <DetailRow label="OAuth client">
            {saved ? <SavedClientFile busy={busy} onReplace={() => setReplacing(true)} onRemove={() => void remove()} /> : "Not saved yet"}
          </DetailRow>
          <DetailRow label="Saved as">
            <EnvName name="GOOGLE_OAUTH_CREDENTIALS" />
          </DetailRow>
          {connection.signedIn === true && (
            <DetailRow label="Sign-in">
              {complete ? signInControl : <DisconnectButton onDisconnect={onSignOut} />}
            </DetailRow>
          )}
          <p>Google ends test-mode sign-ins after 7 days; this card tells you when to sign in again.</p>
          {shell.details}
        </>
      }
    >
      {complete && testArea}
      {!complete && !started && <ConnectButton onClick={() => setOpened(true)} />}
      {!complete && started && (
        <SetupChecklist>
          <SetupStep done={!choosing} label="Enable the Calendar API" hint="Pick or create a project, then Enable.">
            <ExternalButton href="https://console.cloud.google.com/apis/library/calendar-json.googleapis.com">Open Google Cloud</ExternalButton>
          </SetupStep>
          <SetupStep done={!choosing} label="Add yourself as a test user" hint="If asked, set up the consent screen first (External, your email).">
            <ExternalButton href="https://console.cloud.google.com/auth/audience">Open Audience</ExternalButton>
          </SetupStep>
          <SetupStep done={!choosing} label="Create a Desktop app OAuth client" hint="Type Desktop app → Create → Download JSON.">
            <ExternalButton href="https://console.cloud.google.com/auth/clients/create">Create client</ExternalButton>
          </SetupStep>
          <SetupStep
            done={!choosing}
            label="Choose the downloaded JSON file"
            hint="Or drop it on this card."
            below={secret?.problem !== undefined && <span className="text-amber-700 dark:text-amber-400">{secret.problem}</span>}
          >
            <ChooseClientFile busy={busy} primary={choosing} onFile={(file) => void upload(file)} />
            {replacing && (
              <button type="button" className={SETTINGS_BUTTON} disabled={busy} onClick={() => setReplacing(false)}>
                Cancel
              </button>
            )}
          </SetupStep>
          <SetupStep done={signedIn && !waiting} label={expired ? "Sign in again (the sign-in expired)" : "Sign in with Google"}>
            {signInControl}
          </SetupStep>
        </SetupChecklist>
      )}
      {signInFailure !== undefined && <p className="text-xs text-red-600 dark:text-red-400">{signInFailure}</p>}
      {error !== undefined && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      {signOutError !== undefined && <p className="text-xs text-red-600 dark:text-red-400">{signOutError}</p>}
    </ConnectionShell>
  );
}
