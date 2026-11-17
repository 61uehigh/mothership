"use client";

import { LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { YouTubeMusicIcon } from "@/ui/brandIcons";
import { fetchJson, fetchText, jsonRequest, useJson } from "@/ui/useJson";
import { usePageVisible } from "@/ui/usePageVisible";
import { ConnectionFailure } from "@/features/settings/ui/ConnectionFailure";
import { ConnectButton, ConnectedRow, ConnectionShell, DetailRow, DisconnectButton } from "@/features/settings/ui/ConnectionShell";
import { ChooseClientFile, SavedClientFile } from "@/features/settings/ui/oauthClientFile";
import { SetupChecklist, SetupStep } from "@/features/settings/ui/setupChecklist";
import { SETTINGS_BUTTON, SETTINGS_PRIMARY_BUTTON } from "@/features/settings/ui/settingsLayout";
import { ExternalButton } from "@/features/settings/ui/SetupSteps";
import { diagnoseConnection, type ConnectionProblem } from "@/features/settings/model/connectionDiagnosis";
import { youTubeChip } from "@/features/settings/model/connectionStatus";
import { isOAuthClientTooLarge, OAUTH_CLIENT_TOO_LARGE, useFileDrop } from "@/features/settings/ui/useFileDrop";
import { apiLibraryUrl, type ConnectionStatus, type YouTubeMusicTest } from "@/features/youtube-music/model/YouTubeMusic";

/** Picks up a sign-in finished in your browser. */
const POLL_MS = 2_000;

type Failure = { message: string; problem: ConnectionProblem | undefined };

/** Who is signed in: the email address, else the channel's name. */
const who = (status: ConnectionStatus) => status.email ?? status.account;

/**
 * ### YouTubeMusicCard
 *
 * YouTube Music in Settings → Connections, laid out like the other cards: a
 * checklist of Google Cloud steps with direct links, choosing its OAuth
 * client file, and signing in with Google (read-only YouTube access); once
 * signed in, the account with Test and Disconnect, and failures that say
 * what to do. YouTube Music has its own client and sign-in, apart from
 * Google Calendar's: Calendar is often a work account whose client only
 * lets its organisation in, and YouTube Music a personal one, so the steps
 * make a project under your personal account.
 */
export function YouTubeMusicCard() {
  const visible = usePageVisible();
  const [waiting, setWaiting] = useState(false);
  const status = useJson<ConnectionStatus>("/api/youtube-music/status", { pollMs: waiting && visible ? POLL_MS : undefined });
  const [test, setTest] = useState<YouTubeMusicTest | "running" | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [opened, setOpened] = useState(false);
  const data = status.data;
  const signedIn = data?.state === "connected" || data?.state === "expired";
  const hasClient = data !== undefined && data.state !== "unconfigured";
  const choosing = !hasClient || replacing;

  // The latest test failure, else why the last sign-in did not finish.
  const failureMessage =
    test !== undefined && test !== "running" && !test.ok ? test.message : !waiting && data?.signInError !== undefined ? data.signInError : undefined;
  const failure: Failure | undefined =
    failureMessage === undefined ? undefined : { message: failureMessage, problem: diagnoseConnection("youtube_music", failureMessage) };
  const cause = failure?.problem?.cause;
  const expired = data?.state === "expired" || cause === "expired";
  const chip = youTubeChip(data, failure);

  const running = useRef(false);
  async function runTest() {
    if (running.current) return;
    running.current = true;
    setTest("running");
    const result = await fetchJson<YouTubeMusicTest>("/api/youtube-music/test", { method: "POST" });
    running.current = false;
    setTest(result.ok ? result.data : { ok: false, message: result.error, code: undefined });
    status.reload();
  }

  const testRef = useRef(runTest);
  useEffect(() => {
    testRef.current = runTest;
  });
  // A sign-in finished (or came back refused) in your browser: stop waiting, and check one that worked.
  const connected = data?.state === "connected";
  const signInFailed = data?.signInError !== undefined;
  useEffect(() => {
    if (!waiting || !(connected || signInFailed)) return;
    const timer = setTimeout(() => {
      setWaiting(false);
      if (connected) void testRef.current();
    }, 0);
    return () => clearTimeout(timer);
  }, [waiting, connected, signInFailed]);
  // After you go enable the API, coming back to the app checks again.
  useEffect(() => {
    if (cause !== "api-disabled") return;
    const onFocus = () => void testRef.current();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [cause]);

  function signIn() {
    // A new tab (in the desktop app, your browser); Google comes back to this server.
    window.open("/youtube-music/connect", "_blank", "noopener");
    setError(undefined);
    setTest(undefined);
    setWaiting(true);
  }

  async function signOut() {
    const result = await fetchText("/api/youtube-music/connection", { method: "DELETE" });
    setError(result.ok ? undefined : result.error);
    setTest(undefined);
    status.reload();
  }

  async function sendClient(method: "PUT" | "DELETE", content?: string) {
    setBusy(true);
    setError(undefined);
    const result = await fetchJson<ConnectionStatus>("/api/youtube-music/client", content === undefined ? { method } : jsonRequest(method, { content }));
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setReplacing(false);
    setTest(undefined);
    status.reload();
  }

  async function upload(file: File | undefined) {
    if (file === undefined) return;
    if (isOAuthClientTooLarge(file)) return setError(OAUTH_CLIENT_TOO_LARGE);
    await sendClient("PUT", await file.text());
  }

  const drop = useFileDrop(choosing, (file) => void upload(file));
  const complete = data !== undefined && signedIn && !expired && !replacing;
  const started = hasClient || opened;

  const signInControl = waiting ? (
    <>
      <LoaderCircle size={13} className="animate-spin text-teal-500" aria-hidden />
      <span role="status" className="text-zinc-500">
        Finish in your browser…
      </span>
      <button type="button" className={SETTINGS_BUTTON} onClick={() => setWaiting(false)}>
        Cancel
      </button>
    </>
  ) : (
    <button type="button" className={signedIn && !expired ? SETTINGS_BUTTON : SETTINGS_PRIMARY_BUTTON} disabled={!hasClient || replacing} onClick={signIn}>
      {signedIn ? "Sign in again" : "Sign in with Google"}
    </button>
  );
  const passed = test !== undefined && test !== "running" && test.ok ? test : undefined;
  const account = data === undefined ? undefined : who(data);

  return (
    <ConnectionShell
      icon={YouTubeMusicIcon}
      title="YouTube Music"
      chip={chip}
      description="Your playlists and liked songs in the mini player."
      drop={drop}
      details={
        data !== undefined && (
          <>
            <DetailRow label="OAuth client">
              {hasClient ? (
                <SavedClientFile project={data.projectId} busy={busy} onReplace={() => setReplacing(true)} onRemove={() => void sendClient("DELETE")} />
              ) : (
                "Not saved yet"
              )}
            </DetailRow>
            {signedIn && (
              <DetailRow label="Sign-in">
                {complete ? signInControl : <DisconnectButton onDisconnect={signOut} />}
              </DetailRow>
            )}
            <p>
              Use the <strong className="font-medium text-zinc-700 dark:text-zinc-300">personal Google account</strong> you use YouTube Music with for every
              step (check the account switcher at the top right of each Google Cloud page). Its client is separate from Google Calendar&apos;s, which is often a
              work account that only lets its organisation in.
            </p>
            <p>Read-only: your playlists, liked songs, and search. Google ends test-mode sign-ins after 7 days; this card tells you when to sign in again.</p>
          </>
        )
      }
    >
      {data !== undefined && complete && (
        <ConnectedRow
          result={passed === undefined ? `Signed in${account === undefined ? "" : ` as ${account}`}` : `Connected${passed.who === undefined ? "" : ` as ${passed.who}`} · ${passed.items} playlist${passed.items === 1 ? "" : "s"}`}
          testing={test === "running"}
          testLabel={failure !== undefined ? "Check again" : "Test"}
          testDisabled={waiting}
          onTest={() => void runTest()}
        >
          <DisconnectButton onDisconnect={signOut} />
        </ConnectedRow>
      )}
      {data !== undefined && !complete && !started && <ConnectButton onClick={() => setOpened(true)} />}
      {data !== undefined && !complete && started && (
        <SetupChecklist>
          <SetupStep done={!choosing} label="Create a project in your personal account" hint="Under No organisation, e.g. “mothership-music”.">
            <ExternalButton href="https://console.cloud.google.com/projectcreate">Create project</ExternalButton>
          </SetupStep>
          <SetupStep done={!choosing} label="Enable the YouTube Data API v3" hint="In that project, then Enable.">
            <ExternalButton href={apiLibraryUrl(undefined)}>Open Google Cloud</ExternalButton>
          </SetupStep>
          <SetupStep done={!choosing} label="Add yourself as a test user" hint="Audience External, status Testing; add your personal address under Test users.">
            <ExternalButton href="https://console.cloud.google.com/auth/audience">Open Audience</ExternalButton>
          </SetupStep>
          <SetupStep done={!choosing} label="Create a Desktop app OAuth client" hint="Type Desktop app → Create → Download JSON.">
            <ExternalButton href="https://console.cloud.google.com/auth/clients/create">Create client</ExternalButton>
          </SetupStep>
          <SetupStep
            done={!choosing}
            label="Choose the downloaded JSON file"
            hint="Or drop it on this card."
            below={data.clientSaved && data.reason !== undefined && <span className="text-amber-700 dark:text-amber-400">{data.reason}.</span>}
          >
            <ChooseClientFile busy={busy} primary={choosing} onFile={(file) => void upload(file)} />
            {replacing && (
              <button type="button" className={SETTINGS_BUTTON} disabled={busy} onClick={() => setReplacing(false)}>
                Cancel
              </button>
            )}
          </SetupStep>
          <SetupStep
            done={signedIn && !expired && !waiting}
            label={expired ? "Sign in again (the sign-in expired)" : "Sign in with your personal Google account"}
            below={waiting && <span className="text-amber-700 dark:text-amber-400">Google says “org_internal”? Use a client from your personal account.</span>}
          >
            {signInControl}
          </SetupStep>
        </SetupChecklist>
      )}
      {failure !== undefined && <ConnectionFailure message={failure.message} problem={failure.problem} onSignIn={hasClient ? signIn : undefined} />}
      {error !== undefined && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      {status.error !== undefined && data === undefined && <p className="text-xs text-red-600 dark:text-red-400">{status.error}</p>}
    </ConnectionShell>
  );
}
