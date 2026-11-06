"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { SecretState } from "@/features/settings/model/Settings";
import { useDeveloperMode } from "@/features/settings/ui/developerMode";
import { DetailRow, Disclosure, EnvName } from "@/features/settings/ui/connectionParts";
import { ChooseClientFile, isOAuthClientTooLarge, OAUTH_CLIENT_TOO_LARGE } from "@/features/settings/ui/oauthClientFile";
import { OptionalSteps, SetupChecklist, SetupStep } from "@/features/settings/ui/setupChecklist";
import { SETTINGS_BUTTON, SETTINGS_PRIMARY_BUTTON } from "@/features/settings/ui/settingsLayout";
import { ExternalButton } from "@/features/settings/ui/setupSteps";
import { useFileDrop } from "@/features/settings/ui/useFileDrop";
import { chipLabel } from "@/shell/connectionProblemText";
import { GoogleIcon } from "@/ui/brandIcons";
import { useT } from "@/ui/i18n/useT";
import { StatusChip } from "@/ui/StatusChip";

const TEXT_BUTTON = "rounded px-1 text-teal-700 hover:bg-teal-50 disabled:opacity-50 dark:text-teal-400 dark:hover:bg-teal-950/40";

const OpenClientSetup = createContext<{ open: () => void; showing: boolean } | undefined>(undefined);

/**
 * ### SetUpClientButton
 *
 * The button on a Google tool's "Set up the Google OAuth client" step: opens
 * the shared client's steps at the top of the Google card and scrolls to them;
 * once they are open, it points up to them. Renders nothing outside the card
 * or once the client is saved.
 */
export function SetUpClientButton() {
  const setup = useContext(OpenClientSetup);
  const t = useT();
  if (setup === undefined) return null;
  return (
    <button type="button" className={setup.showing ? SETTINGS_BUTTON : SETTINGS_PRIMARY_BUTTON} onClick={setup.open}>
      {setup.showing ? t("settings.google.stepsAbove") : t("settings.google.setUpClientButton")}
    </button>
  );
}

/**
 * ### GoogleGroupCard
 *
 * One card for the Google tools that share an OAuth client and your work
 * account: the Google logo and the client in a line at the top (saved, with
 * Replace and Remove), its setup steps only while there is none, then
 * Google Calendar and Gmail as rows. Each row keeps only its own steps:
 * turning on its API and signing in. YouTube Music is not in it: it is a
 * personal account with a client of its own.
 *
 * @param secret - `GOOGLE_OAUTH_CREDENTIALS`'s state; never its value.
 * @param onClient - Saves the file's text, or removes it with `null`; resolves to an error message, or `undefined`.
 * @param children - The tools' rows (`nested` cards).
 * @param inUse - Calendar or Gmail signs in with Google, so a missing client is worth flagging in the header.
 */
export function GoogleGroupCard({
  secret,
  onClient,
  inUse,
  children,
}: {
  secret: SecretState | undefined;
  onClient: (content: string | null) => Promise<string | undefined>;
  inUse: boolean;
  children: ReactNode;
}) {
  const t = useT();
  const saved = secret?.set === true && secret.problem === undefined;
  const developer = useDeveloperMode();
  const [replacing, setReplacing] = useState(false);
  const [opened, setOpened] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const choosing = !saved || replacing;
  const showSteps = replacing || opened || secret?.problem !== undefined;

  async function upload(file: File | undefined) {
    if (file === undefined) return;
    if (isOAuthClientTooLarge(file)) return setError(t(OAUTH_CLIENT_TOO_LARGE));
    setBusy(true);
    setError(undefined);
    const failure = await onClient(await file.text());
    setBusy(false);
    setError(failure);
    if (failure === undefined) {
      setReplacing(false);
      setOpened(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(await onClient(null));
    setBusy(false);
  }

  const drop = useFileDrop(choosing, (file) => void upload(file));

  // A tool row's "Set up client" asks for the steps; bring them into view once they render.
  const steps = useRef<HTMLDivElement>(null);
  const [scrollRequest, setScrollRequest] = useState(0);
  useEffect(() => {
    if (scrollRequest > 0) steps.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [scrollRequest]);
  const openSetup = () => {
    setOpened(true);
    setScrollRequest((n) => n + 1);
  };

  return (
    <section
      aria-labelledby="google-group"
      className={`flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800 ${drop.dragging ? "outline-2 outline-offset-2 outline-teal-500 outline-dashed" : ""}`}
      {...drop.handlers}
    >
      <header className="flex flex-wrap items-center gap-2">
        <GoogleIcon size={16} aria-hidden />
        <h3 id="google-group" className="text-sm font-medium">
          Google
        </h3>
        <span className="ml-auto flex flex-wrap items-center gap-1 text-xs text-zinc-500">
          {saved && !replacing ? (
            <>
              <span>{t("settings.google.clientSaved")}</span>
              <span aria-hidden>·</span>
              <button type="button" className={TEXT_BUTTON} disabled={busy} onClick={() => setReplacing(true)}>
                {t("settings.replace")}
              </button>
              <button type="button" className={TEXT_BUTTON} disabled={busy} onClick={() => void remove()}>
                {t("settings.remove")}
              </button>
            </>
          ) : inUse || secret?.problem !== undefined || showSteps ? (
            <>
              <StatusChip tone={secret?.problem === undefined ? "neutral" : "warn"} label={`${t("settings.google.oauthClient")}: ${chipLabel(t, "not-set-up")}`} />
              {!showSteps && (
                <button type="button" className={TEXT_BUTTON} onClick={openSetup}>
                  {t("settings.google.setUp")}
                </button>
              )}
            </>
          ) : // Neither tool signs in with Google yet: an unset client isn't a problem to flag; Gmail's steps lead to it.
          null}
        </span>
      </header>
      <p className="-mt-1 text-xs text-zinc-500">{t("settings.google.groupDescription")}</p>
      {choosing && showSteps && (
        <div ref={steps} className="scroll-mt-4">
          <SetupChecklist>
            <SetupStep done={false} label={t("settings.google.pickProject")} hint={t("settings.google.pickProjectHint")}>
              <ExternalButton href="https://console.cloud.google.com/projectselector2/home/dashboard">{t("settings.info.open", { name: "Google Cloud" })}</ExternalButton>
            </SetupStep>
            <SetupStep done={false} label={t("settings.google.createClient")} hint={t("settings.google.createClientWorkHint")}>
              <ExternalButton href="https://console.cloud.google.com/auth/clients/create">{t("settings.google.createClientButton")}</ExternalButton>
            </SetupStep>
            <SetupStep
              done={false}
              label={t("settings.google.chooseJson")}
              hint={t("settings.google.chooseJsonSharedHint")}
              below={secret?.problem !== undefined && <span className="text-amber-700 dark:text-amber-400">{t("settings.secret.fileMissing")}</span>}
            >
              <ChooseClientFile busy={busy} primary onFile={(file) => void upload(file)} />
              <button
                type="button"
                className={SETTINGS_BUTTON}
                disabled={busy}
                onClick={() => {
                  setReplacing(false);
                  setOpened(false);
                }}
              >
                {t("ui.cancel")}
              </button>
            </SetupStep>
            <OptionalSteps>
              <SetupStep done={false} label={t("settings.google.externalTestUser")} hint={t("settings.google.externalTestUserHint")}>
                <ExternalButton href="https://console.cloud.google.com/auth/audience">{t("settings.info.open", { name: "Audience" })}</ExternalButton>
              </SetupStep>
            </OptionalSteps>
          </SetupChecklist>
        </div>
      )}
      {error !== undefined && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <OpenClientSetup.Provider value={saved ? undefined : { open: openSetup, showing: choosing && showSteps }}>{children}</OpenClientSetup.Provider>
      <Disclosure summary={t("settings.google.aboutClient")}>
        {developer && (
          <DetailRow label={t("settings.google.savedAs")}>
            <EnvName name="GOOGLE_OAUTH_CREDENTIALS" />
          </DetailRow>
        )}
        <p>{t("settings.google.aboutClientText")}</p>
      </Disclosure>
    </section>
  );
}
