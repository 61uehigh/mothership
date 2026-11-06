"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useDeveloperMode } from "@/features/settings/ui/developerMode";
import { readCachedTest, writeCachedTest } from "@/features/settings/ui/connectionCache";
import { connectionInfo } from "@/features/settings/ui/connectionInfo";
import { ConnectionFailure } from "@/features/settings/ui/ConnectionFailure";
import { ConnectButton, ConnectedRow, ConnectionShell, DetailRow, DisconnectButton, Disclosure, EnvName } from "@/features/settings/ui/connectionParts";
import { GoogleSetup, GoogleSignInSteps } from "@/features/settings/ui/googleSetup";
import { SecretField } from "@/features/settings/ui/SecretField";
import { SetupChecklist, SetupStep } from "@/features/settings/ui/setupChecklist";
import { SETTINGS_BUTTON, SETTINGS_PRIMARY_BUTTON } from "@/features/settings/ui/settingsLayout";
import { ExternalButton } from "@/features/settings/ui/setupSteps";
import { SlackSteps } from "@/features/settings/ui/SlackSteps";
import { useConnectionTest, useRetestOnFocus } from "@/features/settings/ui/useConnectionTest";
import { useModeSwitch } from "@/features/settings/ui/useModeSwitch";
import type { Translate } from "@/ui/i18n/translate";
import { useT } from "@/ui/i18n/useT";
import { SegmentedControl } from "@/ui/SegmentedControl";
import { SELECTED_SEGMENT, UNSELECTED_SEGMENT } from "@/ui/selection";
import { fetchJson, jsonRequest } from "@/ui/useJson";
import type { ConnectionMode, ConnectionTest, ConnectionView } from "@/features/settings/model/Settings";
import { mcpConnectionChip, switchReady, tokenMissing } from "@/features/settings/model/connectionStatus";

const modeLabels = (t: Translate): Record<ConnectionMode, string> => ({ mcp: t("settings.mode.mcp"), claude: t("settings.mode.claude"), off: t("settings.mode.off") });
/** A tool you sign in to with Google has a Google sign-in as its own mode, not a pasted key. */
const modeLabel = (t: Translate, mode: ConnectionMode, google: boolean) => (google && mode === "mcp" ? t("settings.mode.google") : modeLabels(t)[mode]);
const modeTitles = (t: Translate): Record<ConnectionMode, string> => ({
  mcp: t("settings.mode.mcpTitle"),
  claude: t("settings.mode.claudeTitle"),
  off: t("settings.mode.offTitle"),
});
const LINK = "text-teal-700 underline underline-offset-2 hover:text-teal-600 dark:text-teal-400";

/** A passed test in a few words: who it is connected as, and how much it loaded. */
function passedText(t: Translate, test: Extract<ConnectionTest, { ok: true }>, via: string | undefined): string {
  const connected =
    test.who === undefined
      ? via === undefined
        ? t("settings.card.connected")
        : t("settings.card.connectedVia", { via })
      : via === undefined
        ? t("settings.card.connectedAs", { who: test.who })
        : t("settings.card.connectedAsVia", { who: test.who, via });
  const items = test.items === 1 ? t("settings.card.item") : t("settings.card.items", { count: test.items });
  return `${connected} · ${items}`;
}

/**
 * ### ConnectionCard
 *
 * One MCP tool in Settings → Connections, showing only what its state
 * needs: a Connect button before setup, a checklist during it, and the
 * account with Test and Disconnect once connected. How it connects, the
 * saved variables and the longer how-to sit under Details. Saving a token
 * or signing in tests the connection right away.
 *
 * @param onMode - Saves a mode; `default` hands the choice back to the config files. Resolves to an error message, or `undefined`.
 * @param onSecret - Saves one `.env.local` value; resolves to an error message, or `undefined`.
 * @param onRequest - Sends a Settings change that answers with the new view (Google Calendar's sign-out); resolves to an error message, or `undefined`.
 * @param onRefresh - Reloads the Settings view.
 * @param nested - Drawn as a row of a group card (see `ConnectionShell`).
 */
export function ConnectionCard({
  connection,
  locked,
  onMode,
  onSecret,
  onRequest,
  onRefresh,
  nested = false,
}: {
  connection: ConnectionView;
  /** A custom MCP config (demo mode) is in use, so choices here would not apply. */
  locked: boolean;
  onMode: (mode: ConnectionMode | "default") => Promise<string | undefined>;
  onSecret: (name: string, value: string) => Promise<string | undefined>;
  onRequest: (url: string, method: string, body: unknown) => Promise<string | undefined>;
  onRefresh: () => Promise<void>;
  nested?: boolean;
}) {
  const t = useT();
  const info = connectionInfo(t)[connection.id];
  const MODE_TITLES = modeTitles(t);
  const developer = useDeveloperMode();
  // The last finished result stays on screen while a new check runs; the row's spinner says it is checking.
  const {
    test,
    settled,
    setTest,
    run: runTest,
  } = useConnectionTest(
    async (): Promise<ConnectionTest> => {
      const result = await fetchJson<ConnectionTest>("/api/settings/test", jsonRequest("POST", { id: connection.id }));
      return result.ok ? result.data : { ok: false, message: result.error };
    },
    (done) => writeCachedTest(connection.id, connection.mode, done),
  );
  const [opened, setOpened] = useState(false);
  // Connect on an Off card saves the key mode at once; Cancel puts back what it was (chosen Off, or the config files' choice).
  const [cancelTo, setCancelTo] = useState<ConnectionMode | "default" | undefined>(undefined);
  // Replacing a token the tool refused, from the failure's fix button.
  const [replacing, setReplacing] = useState(false);
  const missing = tokenMissing(connection);
  // What this browser saw last time, shown at once (instead of "Checking…") until something newer arrives.
  const [cached, setCached] = useState(() => readCachedTest(connection.id, connection.mode));
  // Your own test wins; then what the sidebar last saw; then this browser's memory. Without a key, the setup steps say enough.
  const latest = missing ? undefined : (settled ?? connection.last ?? cached);
  const chip = mcpConnectionChip(connection, latest, test === "running" && latest === undefined);
  const google = info.setup === "google";
  const cause = latest !== undefined && !latest.ok ? latest.problem?.cause : undefined;
  // GoogleSetup starts a sign-in each time this changes.
  const [signInNonce, setSignInNonce] = useState(0);
  const [signOutError, setSignOutError] = useState<string | undefined>(undefined);

  const modeSwitch = useModeSwitch(connection, chip.state === "connected", onMode, setTest);
  const { pendingMode, switchTo, switching, switchFailure, revertError, clearPending } = modeSwitch;

  // A mode change makes earlier results stale.
  const mode = useRef(connection.mode);
  useEffect(() => {
    if (mode.current === connection.mode) return;
    mode.current = connection.mode;
    setTest(undefined);
    setCached(readCachedTest(connection.id, connection.mode));
    clearPending();
  }, [connection.id, connection.mode, setTest, clearPending]);

  // The sidebar's result is newer than this browser's memory; remember it too.
  const last = connection.last;
  useEffect(() => {
    if (last !== undefined) writeCachedTest(connection.id, connection.mode, last);
  }, [last, connection.id, connection.mode]);

  // Results live in the server's memory, so after a restart nothing has been seen yet: check once (showing the remembered result meanwhile).
  const untested = !missing && connection.mode !== "off" && chip.state !== "needs-sign-in" && connection.last === undefined && test === undefined;
  useEffect(() => {
    if (untested) void runTest();
  }, [untested, runTest]);
  useRetestOnFocus(cause === "api-disabled" || cause === "mcp-access", () => void runTest());

  async function saveSecret(name: string, value: string) {
    const failure = await onSecret(name, value);
    if (failure === undefined) setReplacing(false);
    // While switching, the key is for the new way; the old way's test would say nothing about it.
    if (failure === undefined && value.trim() !== "" && switchTo === undefined) void runTest();
    if (failure === undefined && value.trim() === "") {
      setTest(undefined);
      setCached(undefined);
      writeCachedTest(connection.id, connection.mode, undefined);
    }
    return failure;
  }

  async function signOutOfGoogle() {
    const failure = await onRequest("/api/settings/google/sign-out", "POST", undefined);
    setTest(undefined);
    setCached(undefined);
    writeCachedTest(connection.id, connection.mode, undefined);
    setSignOutError(failure);
  }

  async function disconnect() {
    for (const secret of connection.secrets) await saveSecret(secret.name, "");
  }

  const tokensSet = connection.secrets.length > 0 && connection.secrets.every((s) => s.set);
  const fields = connection.secrets.flatMap((secret) => {
    const field = info.fields[secret.name];
    return field === undefined ? [] : [{ secret, field }];
  });

  // Each token's paste step; the steps before it read as done once it is saved.
  const tokenChecklist = (
    <SetupChecklist>
      {info.setup === "slack" && <SlackSteps done={tokensSet} />}
      {info.tokenSteps?.map((step) => (
        <SetupStep key={step.label} done={tokensSet} label={step.label} hint={step.hint}>
          {step.link !== undefined && <ExternalButton href={step.link.href}>{step.link.label}</ExternalButton>}
        </SetupStep>
      ))}
      {fields.map(({ secret, field }) => (
        <SetupStep
          key={secret.name}
          done={secret.set && secret.problem === undefined}
          label={info.pasteLabel ?? t("settings.card.paste", { field: field.label })}
          wide
          below={secret.problem !== undefined && <span className="text-amber-700 dark:text-amber-400">{t("settings.secret.fileMissing")}</span>}
        >
          <SecretField bare secret={secret} label={field.label} placeholder={field.placeholder} onSave={(value) => saveSecret(secret.name, value)} />
        </SetupStep>
      ))}
      {info.afterSteps?.map((step) => <SetupStep key={step.label} done={false} label={step.label} hint={step.hint} below={step.hint !== undefined && <span className="text-zinc-500">{step.hint}</span>} />)}
      {cancelTo !== undefined && !connection.secrets.some((s) => s.set) && (
        <li className="list-none">
          <button
            type="button"
            className={SETTINGS_BUTTON}
            onClick={() => {
              setOpened(false);
              void modeSwitch.save(cancelTo);
              setCancelTo(undefined);
            }}
          >
            {t("ui.cancel")}
          </button>
        </li>
      )}
    </SetupChecklist>
  );

  const failed = latest !== undefined && !latest.ok;
  // A refused or too narrow token is fixed by pasting another one.
  const replaceable = connection.mode === "mcp" && !google && tokensSet && (cause === "token" || cause === "scope");
  const testArea: ReactNode = (
    <>
      <ConnectedRow
        result={latest?.ok === true ? passedText(t, latest, connection.mode === "claude" ? "claude.ai" : undefined) : undefined}
        testing={test === "running"}
        testLabel={failed ? t("settings.checkAgain") : t("settings.test")}
        onTest={() => void runTest()}
      >
        {connection.mode === "mcp" && !google && tokensSet && <DisconnectButton onDisconnect={disconnect} />}
        {connection.mode === "mcp" && google && connection.signedIn === true && <DisconnectButton onDisconnect={signOutOfGoogle} />}
      </ConnectedRow>
      {failed && (
        <ConnectionFailure
          message={latest.message}
          problem={latest.problem}
          unavailable={latest.unavailable}
          tool={info.label}
          onSignIn={google && connection.mode === "mcp" ? () => setSignInNonce((n) => n + 1) : undefined}
          fix={
            replaceable && !replacing ? (
              <button type="button" className={SETTINGS_PRIMARY_BUTTON} onClick={() => setReplacing(true)}>
                {t("settings.card.replaceKey")}
              </button>
            ) : undefined
          }
        />
      )}
      {replacing && (
        <SetupChecklist>
          {info.tokenSteps?.map((step) => (
            <SetupStep key={step.label} done={false} label={step.again ?? step.label} hint={step.hint}>
              {step.link !== undefined && <ExternalButton href={step.link.href}>{step.link.label}</ExternalButton>}
            </SetupStep>
          ))}
          {fields.map(({ secret, field }) => (
            <SetupStep key={secret.name} done={false} label={t("settings.card.pasteNew", { field: field.label })} wide>
              <SecretField
                bare
                startEditing
                secret={secret}
                label={field.label}
                placeholder={field.placeholder}
                onSave={(value) => saveSecret(secret.name, value)}
                onCancel={() => setReplacing(false)}
              />
            </SetupStep>
          ))}
        </SetupChecklist>
      )}
    </>
  );

  const details = (
    <>
      <DetailRow label={t("settings.card.howItConnects")}>{MODE_TITLES[connection.mode]}</DetailRow>
      {developer && connection.chosen && !locked && (
        <DetailRow label={t("settings.card.mode")}>
          {t("settings.card.chosenHere")}
          <button type="button" className={LINK} onClick={() => void modeSwitch.save("default")}>
            {t("settings.card.resetToConfig")}
          </button>
        </DetailRow>
      )}
      {connection.mode === "claude" && connection.connector !== undefined && <DetailRow label={t("settings.card.connector")}>{connection.connector}</DetailRow>}
      {fields.map(({ secret, field }) => (
        <DetailRow key={secret.name} label={`${field.label.charAt(0).toUpperCase()}${field.label.slice(1)}`}>
          <EnvName name={secret.name} />
          {/* With its own key, the card's Disconnect and Replace key change it; only the optional key beside a connector is managed here. */}
          {secret.set && connection.mode === "claude" ? (
            <SecretField bare secret={secret} label={field.label} placeholder={field.placeholder} onSave={(value) => saveSecret(secret.name, value)} />
          ) : secret.set ? (
            t("settings.savedHidden")
          ) : (
            t("settings.notSaved")
          )}
        </DetailRow>
      ))}
      {info.howTo !== undefined && <p>{info.howTo}</p>}
    </>
  );

  const shell = {
    id: connection.id,
    nested,
    icon: info.icon,
    title: info.label,
    // The switch already says Off.
    chip: connection.mode === "off" ? undefined : chip,
    description: info.description,
    details,
    alert: modeSwitch.saveError,
    controls: (
      <SegmentedControl
        label={t("settings.card.howConnects", { name: info.label })}
        value={switchTo ?? pendingMode ?? connection.mode}
        disabled={locked || pendingMode !== undefined || switching}
        options={connection.modes.map((m) => ({ value: m, label: modeLabel(t, m, google), title: MODE_TITLES[m] }))}
        onChange={modeSwitch.choose}
        className="flex rounded-md border border-zinc-300 bg-zinc-100 p-0.5 dark:border-zinc-700 dark:bg-zinc-900"
        optionClassName={(selected) =>
          `whitespace-nowrap rounded px-2 py-0.5 text-xs ${selected ? SELECTED_SEGMENT : UNSELECTED_SEGMENT}`
        }
      />
    ),
  };

  if (switchTo !== undefined) {
    const keyMissing = tokenMissing({ ...connection, mode: "mcp" });
    const ready = switchReady(connection, switchTo);
    const current = modeLabel(t, switching ? switchTo : connection.mode, google);
    return (
      <ConnectionShell {...shell}>
        <div className="flex flex-col gap-2 rounded-md border border-zinc-200 p-2.5 text-xs dark:border-zinc-800">
          <p className="text-zinc-700 dark:text-zinc-300">
            {switchTo === "off"
              ? t("settings.card.turnOffConfirm", { name: info.label })
              : switching
                ? t("settings.card.switchingTrying", { mode: modeLabel(t, switchTo, google) })
                : t("settings.card.switching", { mode: modeLabel(t, switchTo, google), current })}
          </p>
          {switchTo === "claude" && (
            <SetupChecklist>
              <SetupStep done={false} label={t("settings.card.connectInClaudeIfNot", { name: connection.connector ?? info.label })} hint={t("settings.card.connectInClaudeHint")}>
                <ExternalButton href="https://claude.ai/settings/connectors">{t("settings.info.open", { name: "claude.ai" })}</ExternalButton>
              </SetupStep>
            </SetupChecklist>
          )}
          {switchTo === "mcp" && google && <GoogleSignInSteps connection={connection} onSignedIn={() => void onRefresh()} />}
          {switchTo === "mcp" && !google && (keyMissing ? tokenChecklist : <p className="text-zinc-500">{t("settings.card.keySaved")}</p>)}
          {switchFailure !== undefined && (
            <>
              <p className="text-zinc-700 dark:text-zinc-300">
                {revertError === undefined
                  ? t("settings.card.didntSwitch", { mode: modeLabel(t, connection.mode, google) })
                  : t("settings.card.revertFailed", { mode: modeLabel(t, connection.mode, google) })}
              </p>
              <ConnectionFailure message={switchFailure.message} problem={switchFailure.problem} unavailable={switchFailure.unavailable} tool={info.label} />
              {revertError !== undefined && <p className="text-red-600 dark:text-red-400">{revertError}</p>}
            </>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {switchTo === "off" ? (
              <button
                type="button"
                className={`${SETTINGS_BUTTON} border-red-300 text-red-700 dark:border-red-900 dark:text-red-400`}
                onClick={modeSwitch.turnOff}
              >
                {t("settings.card.turnOff")}
              </button>
            ) : (
              <button type="button" className={SETTINGS_PRIMARY_BUTTON} disabled={!ready || switching} onClick={() => void modeSwitch.testAndSwitch()}>
                {switching ? t("settings.card.testingNow") : t("settings.card.testAndSwitch")}
              </button>
            )}
            <button
              type="button"
              className={SETTINGS_BUTTON}
              disabled={switching}
              onClick={modeSwitch.cancel}
            >
              {switchTo === "off" ? t("settings.card.keepOn") : t("ui.cancel")}
            </button>
          </div>
        </div>
      </ConnectionShell>
    );
  }

  if (connection.mode === "mcp" && google) {
    return (
      <GoogleSetup
        connection={connection}
        shell={shell}
        testArea={testArea}
        expired={cause === "expired"}
        signInRequest={signInNonce}
        startOpen={opened}
        onSignedIn={() => {
          setSignOutError(undefined);
          void onRefresh().then(runTest);
        }}
        onSignOut={signOutOfGoogle}
        signOutError={signOutError}
      />
    );
  }

  // Off: the card's one next step is choosing how to connect, not a switch in its header.
  const own = connection.modes.includes("mcp");
  const viaClaude = connection.modes.includes("claude");
  const offChoice = connection.mode === "off" && !locked && (own || viaClaude) && (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className={SETTINGS_PRIMARY_BUTTON}
        disabled={pendingMode !== undefined}
        onClick={() => {
          setOpened(true);
          setCancelTo(connection.chosen ? "off" : "default");
          modeSwitch.choose(own ? "mcp" : "claude");
        }}
      >
        {pendingMode === undefined ? t("settings.connect") : t("settings.card.connecting")}
      </button>
      {own && viaClaude && (
        <button type="button" className={SETTINGS_BUTTON} title={MODE_TITLES.claude} disabled={pendingMode !== undefined} onClick={() => modeSwitch.choose("claude")}>
          {t("settings.card.useConnector")}
        </button>
      )}
    </div>
  );

  if (connection.mode === "off") return <ConnectionShell {...shell}>{offChoice}</ConnectionShell>;

  return (
    <ConnectionShell {...shell}>
      {connection.mode === "mcp" && (missing ? opened || connection.secrets.some((s) => s.set) ? tokenChecklist : <ConnectButton onClick={() => setOpened(true)} /> : testArea)}
      {connection.mode === "claude" && (
        <>
          {/* Only once a check says it isn't connected: while one runs, a working connection would look broken. */}
          {latest !== undefined && !latest.ok && test !== "running" && (
            <SetupChecklist>
              <SetupStep done={false} label={t("settings.card.connectInClaude", { name: connection.connector ?? info.label })} hint={t("settings.card.connectInClaudeHint")}>
                <ExternalButton href="https://claude.ai/settings/connectors">{t("settings.info.open", { name: "claude.ai" })}</ExternalButton>
              </SetupStep>
            </SetupChecklist>
          )}
          {testArea}
          {info.withConnector !== undefined && (
            <Disclosure summary={t("settings.card.optional", { what: info.withConnector })} open={connection.secrets.some((s) => s.set)}>
              {tokenChecklist}
            </Disclosure>
          )}
        </>
      )}
    </ConnectionShell>
  );
}
