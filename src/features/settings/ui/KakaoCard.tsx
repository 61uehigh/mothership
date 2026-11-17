"use client";

import { LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { KakaoTalkIcon } from "@/ui/brandIcons";
import { fetchText, jsonRequest, useJson } from "@/ui/useJson";
import { usePageVisible } from "@/ui/usePageVisible";
import { SecretField } from "@/features/settings/ui/SecretField";
import { ConnectButton, ConnectedRow, ConnectionRow, ConnectionShell, DetailRow, DisconnectButton, EnvName } from "@/features/settings/ui/ConnectionShell";
import { CopyValue, OptionalSteps, SetupChecklist, SetupStep } from "@/features/settings/ui/setupChecklist";
import { SETTINGS_BUTTON, SETTINGS_PRIMARY_BUTTON } from "@/features/settings/ui/settingsLayout";
import { ExternalButton } from "@/features/settings/ui/SetupSteps";
import type { KakaoChats, KakaoOpenTarget, KakaoStatus } from "@/features/kakaotalk/model/KakaoTalk";
import { kakaoMacChip, kakaoMacSteps, kakaoMemoChip } from "@/features/settings/model/connectionStatus";

/** Picks up a sign-in finished in another browser tab or window. */
const POLL_MS = 5_000;
const KEY = { name: "KAKAO_REST_API_KEY", label: "REST API key", placeholder: "Kakao app REST API key" };
const SECRET = { name: "KAKAO_CLIENT_SECRET", label: "Client secret", placeholder: "Only if the app turns on client secrets" };

/**
 * ### KakaoCard
 *
 * KakaoTalk in Settings → Connections, as two rows with their own status:
 * sending notes to yourself through Kakao's API (a Kakao app's REST API
 * key, its client secret when the app uses one, and signing in with Kakao),
 * and, on a Mac, reading chats from the KakaoTalk window (two privacy
 * permissions and the app open on its Chats tab). Kakao is not an MCP
 * server, so it has its own card instead of a `ConnectionCard`.
 *
 * @param onSecret - Saves one `.env.local` value; resolves to an error message, or `undefined`.
 */
export function KakaoCard({ onSecret }: { onSecret: (name: string, value: string) => Promise<string | undefined> }) {
  const visible = usePageVisible();
  const [waiting, setWaiting] = useState(false);
  const status = useJson<KakaoStatus>("/api/kakaotalk", { pollMs: waiting && visible ? POLL_MS : undefined });
  const [origin, setOrigin] = useState("");
  const data = status.data;
  const connected = data?.memo.connected === true;

  useEffect(() => {
    // Read after mount: the server render has no window.
    const timer = setTimeout(() => setOrigin(window.location.origin), 0);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!connected) return;
    const timer = setTimeout(() => setWaiting(false), 0);
    return () => clearTimeout(timer);
  }, [connected]);

  async function saveSecret(name: string, value: string) {
    const failure = await onSecret(name, value);
    status.reload();
    return failure;
  }

  const redirectUri = `${origin}/api/kakaotalk/auth/callback`;
  return (
    <ConnectionShell
      icon={KakaoTalkIcon}
      title="KakaoTalk"
      description={`Send notes to your own KakaoTalk chat (나와의 채팅)${data?.platform === "mac" ? ", and see your chats on this Mac" : ""}.`}
      details={
        data !== undefined && (
          <>
            {[KEY, SECRET].map((field) => {
              const set = field === KEY ? data.memo.keySet : data.memo.secretSet;
              return (
                <DetailRow key={field.name} label={field.label}>
                  <EnvName name={field.name} />
                  {set ? (
                    <SecretField bare secret={{ name: field.name, set }} label={field.label} placeholder={field.placeholder} onSave={(v) => saveSecret(field.name, v)} />
                  ) : (
                    "Not saved"
                  )}
                </DetailRow>
              );
            })}
            <DetailRow label="Redirect URI">
              <CopyValue value={redirectUri} what="Redirect URI" />
            </DetailRow>
            <p>
              Notes go through Kakao&apos;s official API, so they work on any computer. A web address in a note becomes a link only when its domain is
              registered under Platform → Web in your Kakao app.
            </p>
            {data.platform === "mac" && (
              <p>
                KakaoTalk has no official API for reading chats, so on a Mac the section reads the KakaoTalk window. In development, allow the app that runs
                the dev server (such as your terminal) instead of mothership.
              </p>
            )}
          </>
        )
      }
    >
      {data !== undefined && (
        <>
          <MemoRow memo={data.memo} redirectUri={redirectUri} waiting={waiting} onWaiting={setWaiting} onSecret={saveSecret} onChanged={status.reload} />
          {data.platform === "mac" && <MacRow />}
        </>
      )}
      {status.error !== undefined && data === undefined && <p className="text-xs text-red-600 dark:text-red-400">{status.error}</p>}
    </ConnectionShell>
  );
}

/** Notes to yourself: the Kakao app's setup and signing in, or the signed-in account. */
function MemoRow({
  memo,
  redirectUri,
  waiting,
  onWaiting,
  onSecret,
  onChanged,
}: {
  memo: KakaoStatus["memo"];
  redirectUri: string;
  waiting: boolean;
  onWaiting: (waiting: boolean) => void;
  onSecret: (name: string, value: string) => Promise<string | undefined>;
  onChanged: () => void;
}) {
  const [opened, setOpened] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  async function signOut() {
    const result = await fetchText("/api/kakaotalk/auth", { method: "DELETE" });
    setError(result.ok ? undefined : result.error);
    onChanged();
  }

  function signIn() {
    // A new tab (or, in the desktop app, your browser): Kakao's consent page comes back to this server.
    window.open("/api/kakaotalk/auth", "_blank", "noopener");
    onWaiting(true);
  }

  return (
    <ConnectionRow title="Note to self (Kakao API)" chip={kakaoMemoChip(memo)}>
      {memo.connected ? (
        <ConnectedRow result="Signed in with Kakao" testing={false}>
          <DisconnectButton onDisconnect={signOut} />
        </ConnectedRow>
      ) : !memo.keySet && !memo.secretSet && !opened ? (
        <ConnectButton onClick={() => setOpened(true)} />
      ) : (
        <>
          <SetupChecklist>
            <SetupStep done={memo.keySet} label="Create a Kakao app" hint="My Application → Add an application">
              <ExternalButton href="https://developers.kakao.com/console/app">Open Kakao Developers</ExternalButton>
            </SetupStep>
            <SetupStep done={false} label="Turn on Kakao Login and add this Redirect URI" hint="Kakao Login → Activation ON → Redirect URI → Register">
              <CopyValue value={redirectUri} what="Redirect URI" />
            </SetupStep>
            <SetupStep done={false} label="Turn on the consent item 카카오톡 메시지 전송" hint="Kakao Login → Consent items → talk_message" />
            <SetupStep done={memo.keySet} label="Paste the app's REST API key" hint="App settings → App keys → REST API key" wide>
              <SecretField bare secret={{ name: KEY.name, set: memo.keySet }} label={KEY.label} placeholder={KEY.placeholder} onSave={(v) => onSecret(KEY.name, v)} />
            </SetupStep>
            <SetupStep done={false} label="Sign in with Kakao">
              {waiting ? (
                <>
                  <LoaderCircle size={13} className="animate-spin text-teal-500" aria-hidden />
                  <span role="status" className="text-zinc-500">
                    Finish on Kakao&apos;s page…
                  </span>
                  <button type="button" className={SETTINGS_BUTTON} onClick={() => onWaiting(false)}>
                    Cancel
                  </button>
                </>
              ) : (
                <button type="button" className={SETTINGS_PRIMARY_BUTTON} disabled={!memo.keySet} onClick={signIn}>
                  Sign in with Kakao
                </button>
              )}
            </SetupStep>
          </SetupChecklist>
          <OptionalSteps open={memo.secretSet}>
            <SetupStep done={memo.secretSet} label="Paste the client secret, if the app uses one" hint="Only when Security → Client secret is on" wide>
              <SecretField bare secret={{ name: SECRET.name, set: memo.secretSet }} label={SECRET.label} placeholder={SECRET.placeholder} onSave={(v) => onSecret(SECRET.name, v)} />
            </SetupStep>
            <SetupStep done={false} label="Register link domains under Platform → Web" hint="A web address in a note becomes a link only when its domain is registered." />
          </OptionalSteps>
        </>
      )}
      {error !== undefined && <p className="text-xs break-words text-red-600 dark:text-red-400">{error}</p>}
    </ConnectionRow>
  );
}

/** Reading chats from the KakaoTalk window on this Mac: what is granted and what is left. */
function MacRow() {
  const chats = useJson<KakaoChats>("/api/kakaotalk/chats");
  const [error, setError] = useState<string | undefined>(undefined);
  const steps = kakaoMacSteps(chats.data);
  const reload = chats.reload;

  // Coming back from System Settings or KakaoTalk checks again.
  useEffect(() => {
    if (chats.data?.state === "ok") return;
    const onFocus = () => reload();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [chats.data?.state, reload]);

  async function open(target: KakaoOpenTarget) {
    const result = await fetchText("/api/kakaotalk/open", jsonRequest("POST", target));
    setError(result.ok ? undefined : result.error);
  }

  const checkAgain = (
    <button type="button" className={SETTINGS_BUTTON} disabled={chats.loading} onClick={reload}>
      Check again
    </button>
  );
  const data = chats.data;
  return (
    <ConnectionRow title="Read chats on this Mac" chip={kakaoMacChip(data)}>
      {data?.state === "ok" ? (
        <ConnectedRow result={`Reading ${data.chats.length} chat${data.chats.length === 1 ? "" : "s"} from KakaoTalk`} testing={chats.loading}>
          {checkAgain}
        </ConnectedRow>
      ) : (
        <>
          <SetupChecklist>
            <SetupStep done={steps.appOpen} label="Open KakaoTalk">
              <button type="button" className={SETTINGS_BUTTON} onClick={() => void open({ kind: "app" })}>
                Open KakaoTalk
              </button>
            </SetupStep>
            <SetupStep done={steps.accessibility} label="Allow mothership under Accessibility" hint="System Settings → Privacy & Security → Accessibility">
              <button type="button" className={SETTINGS_BUTTON} onClick={() => void open({ kind: "accessibility" })}>
                Open System Settings
              </button>
            </SetupStep>
            <SetupStep done={steps.automation} label="Allow mothership to control System Events" hint="System Settings → Privacy & Security → Automation">
              <button type="button" className={SETTINGS_BUTTON} onClick={() => void open({ kind: "automation" })}>
                Open System Settings
              </button>
            </SetupStep>
            <SetupStep done={steps.chatsTab} label="Show the Chats (채팅) tab in KakaoTalk" />
          </SetupChecklist>
          <ConnectedRow testing={chats.loading}>{checkAgain}</ConnectedRow>
        </>
      )}
      {(error ?? chats.error) !== undefined && <p className="text-xs break-words text-red-600 dark:text-red-400">{error ?? chats.error}</p>}
    </ConnectionRow>
  );
}
