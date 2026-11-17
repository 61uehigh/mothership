"use client";

import type { KakaoErrorCode } from "@/lib/apiErrorCodes";
import { useRemembered } from "@/features/settings/ui/connectionCache";
import { useEffect, useState } from "react";
import { KakaoTalkIcon } from "@/ui/brandIcons";
import { useT } from "@/ui/i18n/useT";
import { fetchJson, fetchText, jsonRequest, useJson, type Fetched } from "@/ui/useJson";
import { ConnectedRow, ConnectionShell } from "@/features/settings/ui/connectionParts";
import { SetupChecklist, SetupStep } from "@/features/settings/ui/setupChecklist";
import { SETTINGS_BUTTON } from "@/features/settings/ui/settingsLayout";
import type { KakaoChats, KakaoOpenTarget, KakaoWindowShape } from "@/features/kakaotalk/model/KakaoTalk";
import { useDeveloperMode } from "@/features/settings/ui/developerMode";
import { kakaoFailureText } from "@/shell/kakaoFailureText";
import { kakaoMacChip, kakaoMacSteps } from "@/features/settings/model/connectionStatus";

const withoutChats = (chats: KakaoChats): KakaoChats => (chats.state === "ok" ? { ...chats, chats: [] } : chats);

/**
 * ### KakaoCard
 *
 * KakaoTalk in Settings → Connections: reading your chats from the
 * KakaoTalk window on a Mac (two privacy permissions and the app open on its
 * Chats tab). The section only reads; KakaoTalk has no official API for your
 * chats, and sending as you would mean driving the app, which Kakao's terms
 * don't allow. Off a Mac it says so.
 */
export function KakaoCard() {
  const t = useT();
  const developer = useDeveloperMode();
  const chats = useJson<KakaoChats, KakaoErrorCode>("/api/kakaotalk/chats", { remember: true });
  // Remembered without the chats themselves: the card needs only where setup stands.
  const data = useRemembered("kakaotalk.chats", chats.data, withoutChats);
  return (
    <ConnectionShell
      id="kakaotalk"
      icon={KakaoTalkIcon}
      title={t("settings.kakao.title")}
      chip={kakaoMacChip(data)}
      description={t("settings.kakao.description")}
      details={
        <>
          <p>{t("settings.kakao.details")}</p>
          {developer && data?.state !== "unsupported" && <WindowShape />}
        </>
      }
    >
      {data?.state === "unsupported" ? (
        <p className="text-xs text-zinc-500">{t("settings.kakao.macOnly")}</p>
      ) : (
        <MacSetup chats={chats} />
      )}
    </ConnectionShell>
  );
}

/** Reading chats from the KakaoTalk window on this Mac: what is granted and what is left. */
function MacSetup({ chats }: { chats: Fetched<KakaoChats, KakaoErrorCode> }) {
  const t = useT();
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
    const result = await fetchText<KakaoErrorCode>("/api/kakaotalk/open", jsonRequest("POST", target));
    setError(result.ok ? undefined : kakaoFailureText(t, result));
  }

  const checkAgain = (
    <button type="button" className={SETTINGS_BUTTON} disabled={chats.loading} onClick={reload}>
      {t("settings.checkAgain")}
    </button>
  );
  const data = chats.data;
  return (
    <>
      {data?.state === "ok" ? (
        <ConnectedRow result={data.chats.length === 1 ? t("settings.kakao.readingOne") : t("settings.kakao.reading", { count: data.chats.length })} testing={chats.loading}>
          {checkAgain}
        </ConnectedRow>
      ) : (
        <>
          <SetupChecklist>
            <SetupStep done={steps.appOpen} label={t("settings.kakao.openApp")}>
              <button type="button" className={SETTINGS_BUTTON} onClick={() => void open({ kind: "app" })}>
                {t("settings.kakao.openApp")}
              </button>
            </SetupStep>
            <SetupStep done={steps.accessibility} label={t("settings.kakao.accessibility")} hint={t("settings.kakao.accessibilityHint")}>
              <button type="button" className={SETTINGS_BUTTON} onClick={() => void open({ kind: "accessibility" })}>
                {t("settings.kakao.openSystemSettings")}
              </button>
            </SetupStep>
            <SetupStep done={steps.automation} label={t("settings.kakao.automation")} hint={t("settings.kakao.automationHint")}>
              <button type="button" className={SETTINGS_BUTTON} onClick={() => void open({ kind: "automation" })}>
                {t("settings.kakao.openSystemSettings")}
              </button>
            </SetupStep>
            <SetupStep
              done={steps.chatsTab}
              label={t("settings.kakao.chatsTab")}
              hint={t(data?.state === "no-list" && data.windows === 0 ? "settings.kakao.noWindowHint" : "settings.kakao.chatsTabHint")}
            />
          </SetupChecklist>
          <ConnectedRow testing={chats.loading}>{checkAgain}</ConnectedRow>
        </>
      )}
      {(error ?? chats.failure) !== undefined && (
        <p className="text-xs break-words text-red-600 dark:text-red-400">{error ?? (chats.failure === undefined ? undefined : kakaoFailureText(t, chats.failure))}</p>
      )}
    </>
  );
}

/** Outline of one window element: its role (and subrole), child count, and a text's length. */
function shapeLine(node: Extract<KakaoWindowShape, { state: "ok" }>["nodes"][number]): string {
  const role = node.subrole === "" ? node.role : `${node.role}/${node.subrole}`;
  const length = node.textLength === undefined ? "" : ` len=${node.textLength}`;
  return `${"  ".repeat(node.depth)}${role} (${node.children})${length}`;
}

/**
 * Developer mode only: the KakaoTalk window's structure as the server reads
 * it with the permissions it has, to see why no chat list was found. Shows
 * roles and text lengths, never the text.
 */
function WindowShape() {
  const t = useT();
  const [shape, setShape] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const result = await fetchJson<KakaoWindowShape, KakaoErrorCode>("/api/kakaotalk/shape");
    setLoading(false);
    if (!result.ok) {
      setShape(kakaoFailureText(t, result));
      return;
    }
    const value = result.data;
    setShape(
      value.state === "ok"
        ? [t("settings.kakao.shapeWindows", { count: value.windows }), ...value.nodes.map(shapeLine)].join("\n")
        : value.state === "no-access"
          ? `no-access: ${value.missing}`
          : value.state,
    );
  }

  return (
    <div className="mt-2 space-y-1">
      <button type="button" className={SETTINGS_BUTTON} disabled={loading} onClick={() => void load()}>
        {t("settings.kakao.showShape")}
      </button>
      <p className="text-xs text-zinc-500">{t("settings.kakao.shapeHint")}</p>
      {shape !== undefined && <pre className="max-h-64 overflow-auto rounded bg-zinc-100 p-2 font-mono text-[11px] dark:bg-zinc-900">{shape}</pre>}
    </div>
  );
}
