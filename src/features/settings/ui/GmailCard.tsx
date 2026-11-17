"use client";

import { LoaderCircle } from "lucide-react";
import { useState } from "react";
import { GmailIcon } from "@/ui/brandIcons";
import { useT } from "@/ui/i18n/useT";
import { ConnectionFailure } from "@/features/settings/ui/ConnectionFailure";
import { ConnectButton, ConnectedRow, ConnectionShell, DetailRow, DisconnectButton } from "@/features/settings/ui/connectionParts";
import { SetUpClientButton } from "@/features/settings/ui/googleGroupCard";
import { OptionalSteps, SetupChecklist, SetupStep } from "@/features/settings/ui/setupChecklist";
import { SETTINGS_BUTTON, SETTINGS_PRIMARY_BUTTON } from "@/features/settings/ui/settingsLayout";
import { ExternalButton } from "@/features/settings/ui/setupSteps";
import { useGoogleAccountCard } from "@/features/settings/ui/useGoogleAccountCard";
import { gmailApiLibraryUrl, type GmailStatus, type GmailTest } from "@/features/gmail/model/Gmail";

const projectQuery = (projectId: string | undefined) => (projectId === undefined ? "" : `?project=${encodeURIComponent(projectId)}`);

/**
 * ### GmailCard
 *
 * Gmail in Settings → Connections, under Google Calendar in the Google
 * group. Gmail signs in with the Google OAuth client the group shares with
 * Calendar (your mail and calendar are the same work account, in the same
 * Google Cloud project), so its own steps are turning on the Gmail API in
 * that project and signing in with read-only mail access; Gmail's sign-in is
 * its own, apart from Calendar's.
 * Once signed in: the account with Test and Disconnect, and failures that say
 * what to do.
 *
 * @param nested - Drawn as a row of the Google group card.
 */
export function GmailCard({ nested = false }: { nested?: boolean }) {
  const t = useT();
  const card = useGoogleAccountCard<GmailStatus, GmailTest>("gmail", "gmail");
  const { status, data, chip, failure, signedIn, expired, hasClient, waiting, test, runTest, signIn, signOut, error } = card;
  const [opened, setOpened] = useState(false);
  const cause = failure?.problem?.cause;

  const complete = data !== undefined && signedIn && !expired;
  const started = hasClient || opened;
  const apiOff = cause === "api-disabled";
  const noScope = cause === "scope";

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
    <button type="button" className={signedIn && !expired ? SETTINGS_BUTTON : SETTINGS_PRIMARY_BUTTON} disabled={!hasClient} onClick={signIn}>
      {signedIn ? t("settings.signInAgain") : t("settings.google.signInWithGoogle")}
    </button>
  );
  const passed = test !== undefined && test !== "running" && test.ok ? test : undefined;
  const account = data?.email ?? data?.account;

  return (
    <ConnectionShell
      id="gmail"
      nested={nested}
      icon={GmailIcon}
      title="Gmail"
      chip={chip}
      description={t("settings.gmail.description")}
      details={
        data !== undefined && (
          <>
            <DetailRow label={t("settings.google.oauthClient")}>
              {hasClient ? `${t("settings.google.sharedClient")}${data.projectId === undefined ? "" : ` · ${data.projectId}`}` : t("settings.google.notSavedYet")}
            </DetailRow>
            {signedIn && <DetailRow label={t("settings.google.signIn")}>{complete ? signInControl : <DisconnectButton onDisconnect={signOut} />}</DetailRow>}
            <p>{t("settings.gmail.aboutClient")}</p>
            <p>{t("settings.gmail.readOnly")}</p>
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
              : `${passed.who === undefined ? t("settings.card.connected") : t("settings.card.connectedAs", { who: passed.who })} · ${t("settings.gmail.unread", { count: passed.unread })}`
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
          <SetupStep
            done={hasClient}
            label={t("settings.google.setUpClient")}
            hint={t("settings.google.setUpClientHint")}
            below={data.clientSaved && data.reason !== undefined && <span className="text-amber-700 dark:text-amber-400">{t(`settings.googleClient.${data.reason}`)}</span>}
          >
            {!hasClient && <SetUpClientButton />}
          </SetupStep>
          <SetupStep done={hasClient && !apiOff && signedIn} label={t("settings.gmail.turnOnApi")} hint={t("settings.gmail.turnOnApiHint")}>
            <ExternalButton href={gmailApiLibraryUrl(data.projectId)}>{t("settings.info.open", { name: "Gmail API" })}</ExternalButton>
          </SetupStep>
          <SetupStep
            done={signedIn && !expired && !waiting && !noScope}
            label={expired ? t("settings.google.signInAgainExpired") : t("settings.gmail.signInWork")}
            hint={t("settings.gmail.signInHint")}
            below={waiting && <span className="text-amber-700 dark:text-amber-400">{t("settings.gmail.orgInternal")}</span>}
          >
            {signInControl}
          </SetupStep>
          <OptionalSteps open={noScope}>
            <SetupStep done={false} label={t("settings.gmail.externalScope")} hint={t("settings.gmail.externalScopeHint")}>
              <ExternalButton href={`https://console.cloud.google.com/auth/scopes${projectQuery(data.projectId)}`}>{t("settings.info.open", { name: "Data access" })}</ExternalButton>
            </SetupStep>
          </OptionalSteps>
          {!hasClient && !signedIn && (
            <li className="list-none">
              <button type="button" className={SETTINGS_BUTTON} onClick={() => setOpened(false)}>
                {t("ui.cancel")}
              </button>
            </li>
          )}
        </SetupChecklist>
      )}
      {failure !== undefined && (
        <ConnectionFailure
          message={failure.message}
          problem={failure.problem}
          signInFailure={failure.signIn}
          tool="Gmail"
          onSignIn={hasClient ? signIn : undefined}
          fix={
            noScope &&
            hasClient && (
              <button type="button" className={SETTINGS_PRIMARY_BUTTON} onClick={signIn}>
                {t("settings.signInAgain")}
              </button>
            )
          }
        />
      )}
      {error !== undefined && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      {status.error !== undefined && data === undefined && <p className="text-xs text-red-600 dark:text-red-400">{status.error}</p>}
    </ConnectionShell>
  );
}
