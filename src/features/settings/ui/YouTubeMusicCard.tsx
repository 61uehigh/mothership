"use client";

import { LoaderCircle } from "lucide-react";
import { useState } from "react";
import { YouTubeMusicIcon } from "@/ui/brandIcons";
import { useT } from "@/ui/i18n/useT";
import { fetchJson, jsonRequest } from "@/ui/useJson";
import { ConnectionFailure } from "@/features/settings/ui/ConnectionFailure";
import { ConnectButton, ConnectedRow, ConnectionShell, DetailRow, DisconnectButton } from "@/features/settings/ui/connectionParts";
import { ChooseClientFile, isOAuthClientTooLarge, OAUTH_CLIENT_TOO_LARGE, SavedClientFile } from "@/features/settings/ui/oauthClientFile";
import { SetupChecklist, SetupStep } from "@/features/settings/ui/setupChecklist";
import { SETTINGS_BUTTON, SETTINGS_PRIMARY_BUTTON } from "@/features/settings/ui/settingsLayout";
import { ExternalButton } from "@/features/settings/ui/setupSteps";
import { useGoogleAccountCard } from "@/features/settings/ui/useGoogleAccountCard";
import { useFileDrop } from "@/features/settings/ui/useFileDrop";
import { apiLibraryUrl, type ConnectionStatus, type YouTubeMusicTest } from "@/features/youtube-music/model/YouTubeMusic";

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
  const t = useT();
  const card = useGoogleAccountCard<ConnectionStatus, YouTubeMusicTest>("youtube-music", "youtube_music");
  const { status, data, chip, failure, signedIn, expired, hasClient, waiting, test, runTest, signIn, signOut, error, setError } = card;
  const [opened, setOpened] = useState(false);
  const [busy, setBusy] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const choosing = !hasClient || replacing;

  async function sendClient(method: "PUT" | "DELETE", content?: string) {
    setBusy(true);
    setError(undefined);
    const result = await fetchJson<ConnectionStatus>("/api/youtube-music/client", content === undefined ? { method } : jsonRequest(method, { content }));
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setReplacing(false);
    card.resetTest();
    status.reload();
  }

  async function upload(file: File | undefined) {
    if (file === undefined) return;
    if (isOAuthClientTooLarge(file)) return setError(t(OAUTH_CLIENT_TOO_LARGE));
    await sendClient("PUT", await file.text());
  }

  const drop = useFileDrop(choosing, (file) => void upload(file));
  const complete = data !== undefined && signedIn && !expired && !replacing;
  const started = hasClient || opened;

  const signInControl = waiting ? (
    <>
      <LoaderCircle size={13} className="animate-spin text-teal-500" aria-hidden />
      <span role="status" className="text-zinc-500">
        {t("settings.google.finishInBrowser")}
      </span>
      <button type="button" className={SETTINGS_BUTTON} onClick={card.cancelWaiting}>
        {t("ui.cancel")}
      </button>
    </>
  ) : (
    <button type="button" className={signedIn && !expired ? SETTINGS_BUTTON : SETTINGS_PRIMARY_BUTTON} disabled={!hasClient || replacing} onClick={signIn}>
      {signedIn ? t("settings.signInAgain") : t("settings.google.signInWithGoogle")}
    </button>
  );
  const passed = test !== undefined && test !== "running" && test.ok ? test : undefined;
  const account = data === undefined ? undefined : who(data);

  return (
    <ConnectionShell
      id="youtube_music"
      icon={YouTubeMusicIcon}
      title="YouTube Music"
      chip={chip}
      description={t("settings.youtube.description")}
      drop={drop}
      details={
        data !== undefined && (
          <>
            <DetailRow label={t("settings.google.oauthClient")}>
              {hasClient ? (
                <SavedClientFile project={data.projectId} busy={busy} onReplace={() => setReplacing(true)} onRemove={() => void sendClient("DELETE")} />
              ) : (
                t("settings.google.notSavedYet")
              )}
            </DetailRow>
            {signedIn && (
              <DetailRow label={t("settings.google.signIn")}>
                {complete ? signInControl : <DisconnectButton onDisconnect={signOut} />}
              </DetailRow>
            )}
            <p>{t("settings.youtube.personalAccount")}</p>
            <p>{t("settings.youtube.readOnly")}</p>
          </>
        )
      }
    >
      {data !== undefined && complete && (
        <ConnectedRow
          result={
            passed === undefined
              ? account === undefined
                ? t("settings.card.signedIn")
                : t("settings.card.signedInAs", { who: account })
              : `${passed.who === undefined ? t("settings.card.connected") : t("settings.card.connectedAs", { who: passed.who })} · ${
                  passed.items === 1 ? t("settings.youtube.playlist") : t("settings.youtube.playlists", { count: passed.items })
                }`
          }
          testing={test === "running"}
          testLabel={failure !== undefined ? t("settings.checkAgain") : t("settings.test")}
          testDisabled={waiting}
          onTest={() => void runTest()}
        >
          <DisconnectButton onDisconnect={signOut} />
        </ConnectedRow>
      )}
      {data !== undefined && !complete && !started && <ConnectButton onClick={() => setOpened(true)} />}
      {data !== undefined && !complete && started && (
        <SetupChecklist>
          <SetupStep done={!choosing} label={t("settings.youtube.createProject")} hint={t("settings.youtube.createProjectHint")}>
            <ExternalButton href="https://console.cloud.google.com/projectcreate">{t("settings.youtube.createProjectButton")}</ExternalButton>
          </SetupStep>
          <SetupStep done={!choosing} label={t("settings.youtube.enableApi")} hint={t("settings.youtube.enableApiHint")}>
            <ExternalButton href={apiLibraryUrl(undefined)}>{t("settings.info.open", { name: "YouTube Data API" })}</ExternalButton>
          </SetupStep>
          <SetupStep done={!choosing} label={t("settings.youtube.testUser")} hint={t("settings.youtube.testUserHint")}>
            <ExternalButton href="https://console.cloud.google.com/auth/audience">{t("settings.info.open", { name: "Audience" })}</ExternalButton>
          </SetupStep>
          <SetupStep done={!choosing} label={t("settings.google.createClient")} hint={t("settings.google.createClientHint")}>
            <ExternalButton href="https://console.cloud.google.com/auth/clients/create">{t("settings.google.createClientButton")}</ExternalButton>
          </SetupStep>
          <SetupStep
            done={!choosing}
            label={t("settings.google.chooseJson")}
            hint={t("settings.google.chooseJsonHint")}
            below={data.clientSaved && data.reason !== undefined && <span className="text-amber-700 dark:text-amber-400">{t(`settings.googleClient.${data.reason}`)}</span>}
          >
            <ChooseClientFile busy={busy} primary={choosing} onFile={(file) => void upload(file)} />
            {replacing && (
              <button type="button" className={SETTINGS_BUTTON} disabled={busy} onClick={() => setReplacing(false)}>
                {t("ui.cancel")}
              </button>
            )}
          </SetupStep>
          <SetupStep
            done={signedIn && !expired && !waiting}
            label={expired ? t("settings.google.signInAgainExpired") : t("settings.youtube.signInPersonal")}
            below={waiting && <span className="text-amber-700 dark:text-amber-400">{t("settings.youtube.orgInternal")}</span>}
          >
            {signInControl}
          </SetupStep>
          {!hasClient && !signedIn && (
            <li className="list-none">
              <button type="button" className={SETTINGS_BUTTON} disabled={busy} onClick={() => setOpened(false)}>
                {t("ui.cancel")}
              </button>
            </li>
          )}
        </SetupChecklist>
      )}
      {failure !== undefined && <ConnectionFailure message={failure.message} problem={failure.problem} signInFailure={failure.signIn} tool="YouTube Music" onSignIn={hasClient ? signIn : undefined} />}
      {error !== undefined && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      {status.error !== undefined && data === undefined && <p className="text-xs text-red-600 dark:text-red-400">{status.error}</p>}
    </ConnectionShell>
  );
}
