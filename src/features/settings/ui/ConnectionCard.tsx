"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { CONNECTION_INFO } from "@/features/settings/ui/connectionInfo";
import { ConnectionFailure } from "@/features/settings/ui/ConnectionFailure";
import { ConnectButton, ConnectedRow, ConnectionShell, DetailRow, DisconnectButton, Disclosure, EnvName } from "@/features/settings/ui/ConnectionShell";
import { GoogleSetup } from "@/features/settings/ui/GoogleSetup";
import { SecretField } from "@/features/settings/ui/SecretField";
import { SetupChecklist, SetupStep } from "@/features/settings/ui/setupChecklist";
import { SETTINGS_PRIMARY_BUTTON } from "@/features/settings/ui/settingsLayout";
import { ExternalButton } from "@/features/settings/ui/SetupSteps";
import { SlackSteps } from "@/features/settings/ui/SlackSteps";
import { SegmentedControl } from "@/ui/SegmentedControl";
import { fetchJson, jsonRequest } from "@/ui/useJson";
import type { ConnectionMode, ConnectionTest, ConnectionView } from "@/features/settings/model/Settings";
import { mcpConnectionChip, tokenMissing } from "@/features/settings/model/connectionStatus";

const MODE_LABELS: Record<ConnectionMode, string> = { mcp: "Token", claude: "Claude connector", off: "Off" };
const MODE_TITLES: Record<ConnectionMode, string> = {
  mcp: "The tool's own MCP server with your token: free, fast, and usable by every agent",
  claude: "The claude.ai connector you connected in Claude: no token, but Claude agents only, and each refresh uses a little Claude usage",
  off: "Not used",
};
const LINK = "text-teal-700 underline underline-offset-2 hover:text-teal-600 dark:text-teal-400";

/** A passed test in a few words: who it is connected as, and how much it loaded. */
function passedText(test: Extract<ConnectionTest, { ok: true }>, via: string | undefined): string {
  const who = test.who === undefined ? "" : ` as ${test.who}`;
  return `Connected${who}${via === undefined ? "" : ` through ${via}`} · ${test.items} item${test.items === 1 ? "" : "s"}`;
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
 * @param onMode - Saves a mode; `default` hands the choice back to the config files.
 * @param onSecret - Saves one `.env.local` value; resolves to an error message, or `undefined`.
 * @param onRequest - Sends a Settings change that answers with the new view (the Google client file); resolves to an error message, or `undefined`.
 * @param onRefresh - Reloads the Settings view.
 */
export function ConnectionCard({
  connection,
  locked,
  onMode,
  onSecret,
  onRequest,
  onRefresh,
}: {
  connection: ConnectionView;
  /** A custom MCP config (demo mode) is in use, so choices here would not apply. */
  locked: boolean;
  onMode: (mode: ConnectionMode | "default") => void;
  onSecret: (name: string, value: string) => Promise<string | undefined>;
  onRequest: (url: string, method: string, body: unknown) => Promise<string | undefined>;
  onRefresh: () => Promise<void>;
}) {
  const info = CONNECTION_INFO[connection.id];
  const [test, setTest] = useState<ConnectionTest | "running" | undefined>(undefined);
  const [opened, setOpened] = useState(false);
  // Replacing a token the tool refused, from the failure's fix button.
  const [replacing, setReplacing] = useState(false);
  const missing = tokenMissing(connection);
  // Your own test wins; until then, what the sidebar last saw. Without a token, the setup steps say enough.
  const latest = test === "running" || missing ? undefined : (test ?? connection.last);
  const chip = mcpConnectionChip(connection, latest);
  const google = connection.id === "google_calendar";
  const cause = latest !== undefined && !latest.ok ? latest.problem?.cause : undefined;
  // Asks GoogleSetup to start a sign-in; counts up on each request.
  const [signInRequest, setSignInRequest] = useState(0);
  const [signOutError, setSignOutError] = useState<string | undefined>(undefined);

  // A mode change makes earlier results stale.
  const mode = useRef(connection.mode);
  useEffect(() => {
    if (mode.current === connection.mode) return;
    mode.current = connection.mode;
    setTest(undefined);
  }, [connection.mode]);

  const running = useRef(false);
  async function runTest() {
    if (running.current) return;
    running.current = true;
    setTest("running");
    const result = await fetchJson<ConnectionTest>("/api/settings/test", jsonRequest("POST", { id: connection.id }));
    running.current = false;
    setTest(result.ok ? result.data : { ok: false, message: result.error });
  }

  // After you go turn something on (the Calendar API, Slack MCP access), coming back to the app checks again.
  const testRef = useRef(runTest);
  useEffect(() => {
    testRef.current = runTest;
  });
  useEffect(() => {
    if (cause !== "api-disabled" && cause !== "mcp-access") return;
    const onFocus = () => void testRef.current();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [cause]);

  async function saveSecret(name: string, value: string) {
    const failure = await onSecret(name, value);
    if (failure === undefined) setReplacing(false);
    if (failure === undefined && value.trim() !== "") void runTest();
    if (failure === undefined && value.trim() === "") setTest(undefined);
    return failure;
  }

  async function signOutOfGoogle() {
    const failure = await onRequest("/api/settings/google/sign-out", "POST", undefined);
    setTest(undefined);
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
          label={info.pasteLabel ?? `Paste the ${field.label}`}
          wide
          below={secret.problem !== undefined && <span className="text-amber-700 dark:text-amber-400">{secret.problem}</span>}
        >
          <SecretField bare secret={secret} label={field.label} placeholder={field.placeholder} onSave={(value) => saveSecret(secret.name, value)} />
        </SetupStep>
      ))}
      {info.afterSteps?.map((step) => <SetupStep key={step.label} done={false} label={step.label} hint={step.hint} />)}
    </SetupChecklist>
  );

  const failed = latest !== undefined && !latest.ok;
  // A refused or too narrow token is fixed by pasting another one.
  const replaceable = connection.mode === "mcp" && !google && tokensSet && (cause === "token" || cause === "scope");
  const testArea: ReactNode = (
    <>
      <ConnectedRow
        result={latest?.ok === true ? passedText(latest, connection.mode === "claude" ? "claude.ai" : undefined) : undefined}
        testing={test === "running"}
        testLabel={failed ? "Check again" : "Test"}
        onTest={() => void runTest()}
      >
        {connection.mode === "mcp" && !google && tokensSet && <DisconnectButton onDisconnect={disconnect} />}
        {connection.mode === "mcp" && google && connection.signedIn === true && <DisconnectButton onDisconnect={signOutOfGoogle} />}
      </ConnectedRow>
      {failed && (
        <ConnectionFailure
          message={latest.message}
          problem={latest.problem}
          onSignIn={google && connection.mode === "mcp" ? () => setSignInRequest((n) => n + 1) : undefined}
          fix={
            replaceable && !replacing ? (
              <button type="button" className={SETTINGS_PRIMARY_BUTTON} onClick={() => setReplacing(true)}>
                Replace key
              </button>
            ) : undefined
          }
        />
      )}
      {replacing && (
        <SetupChecklist>
          {info.tokenSteps?.map((step) => (
            <SetupStep key={step.label} done={false} label={step.label.replace(/^Create an? /, "Create a new ")} hint={step.hint}>
              {step.link !== undefined && <ExternalButton href={step.link.href}>{step.link.label}</ExternalButton>}
            </SetupStep>
          ))}
          {fields.map(({ secret, field }) => (
            <SetupStep key={secret.name} done={false} label={`Paste the new ${field.label}`} wide>
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
      <DetailRow label="How it connects">{MODE_TITLES[connection.mode]}</DetailRow>
      {connection.chosen && !locked && (
        <DetailRow label="Mode">
          Chosen here.
          <button type="button" className={LINK} onClick={() => onMode("default")}>
            Reset to config files
          </button>
        </DetailRow>
      )}
      {connection.mode === "claude" && connection.connector !== undefined && <DetailRow label="Connector">{connection.connector}</DetailRow>}
      {fields.map(({ secret, field }) => (
        <DetailRow key={secret.name} label={field.label}>
          <EnvName name={secret.name} />
          {secret.set ? (
            <SecretField bare secret={secret} label={field.label} placeholder={field.placeholder} onSave={(value) => saveSecret(secret.name, value)} />
          ) : (
            "Not saved"
          )}
        </DetailRow>
      ))}
      {info.howTo !== undefined && <p>{info.howTo}</p>}
    </>
  );

  const shell = {
    icon: info.icon,
    title: info.label,
    chip,
    description: info.description,
    details,
    controls: (
      <SegmentedControl
        label={`How ${info.label} connects`}
        value={connection.mode}
        disabled={locked}
        options={connection.modes.map((m) => ({ value: m, label: MODE_LABELS[m], title: MODE_TITLES[m] }))}
        onChange={onMode}
        className="flex rounded-md border border-zinc-300 p-0.5 dark:border-zinc-700"
        optionClassName={(selected) =>
          `whitespace-nowrap rounded px-2 py-0.5 text-xs ${selected ? "bg-zinc-200 font-medium text-zinc-900 dark:bg-zinc-700 dark:text-zinc-100" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"}`
        }
      />
    ),
  };

  if (connection.mode === "mcp" && google) {
    return (
      <GoogleSetup
        connection={connection}
        shell={shell}
        testArea={testArea}
        expired={cause === "expired"}
        signInRequest={signInRequest}
        onClient={(content) =>
          content === null ? onRequest("/api/settings/google/client", "DELETE", undefined) : onRequest("/api/settings/google/client", "PUT", { content })
        }
        onSignedIn={() => {
          setSignOutError(undefined);
          void onRefresh().then(runTest);
        }}
        onSignOut={signOutOfGoogle}
        signOutError={signOutError}
      />
    );
  }

  return (
    <ConnectionShell {...shell}>
      {connection.mode === "mcp" && (missing ? opened || connection.secrets.some((s) => s.set) ? tokenChecklist : <ConnectButton onClick={() => setOpened(true)} /> : testArea)}
      {connection.mode === "claude" && (
        <>
          {latest?.ok !== true && (
            <SetupChecklist>
              <SetupStep done={false} label={`Connect ${connection.connector ?? info.label} in claude.ai`} hint="No token needed; Claude agents only.">
                <ExternalButton href="https://claude.ai/settings/connectors">Open claude.ai</ExternalButton>
              </SetupStep>
            </SetupChecklist>
          )}
          {testArea}
          {info.withConnector !== undefined && (
            <Disclosure summary={`Optional: ${info.withConnector}`} open={connection.secrets.some((s) => s.set)}>
              {tokenChecklist}
            </Disclosure>
          )}
        </>
      )}
    </ConnectionShell>
  );
}
