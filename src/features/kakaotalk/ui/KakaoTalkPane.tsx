"use client";

import { ExternalLink, X } from "lucide-react";
import { useContext, useState } from "react";
import type { KakaoErrorCode } from "@/lib/apiErrorCodes";
import { IconButton, RefreshButton } from "@/ui/iconButtons";
import { Message } from "@/ui/Message";
import { fetchText, jsonRequest, useJson, type ApiFailure } from "@/ui/useJson";
import { usePageVisible } from "@/ui/usePageVisible";
import { PaneHeader, StackedSectionContext } from "@/shell/PaneHeader";
import { useWorkbenchActions } from "@/shell/workbenchContext";
import type { KakaoChat, KakaoChats, KakaoOpenTarget } from "@/features/kakaotalk/model/KakaoTalk";
import { kakaoFailureText, macPermissionText } from "@/shell/kakaoFailureText";
import { openSettingsPage } from "@/shell/settingsPage";
import { ROW_HOVER } from "@/ui/selection";
import { useT } from "@/ui/i18n/useT";

/** Reading the window takes several seconds (the app answers each element separately), so the list refreshes less often than other sections. */
const CHATS_POLL_MS = 30_000;

async function openInApp(target: KakaoOpenTarget): Promise<ApiFailure<KakaoErrorCode> | undefined> {
  const result = await fetchText<KakaoErrorCode>("/api/kakaotalk/open", jsonRequest("POST", target));
  return result.ok ? undefined : result;
}

function ChatRow({ chat, onOpen }: { chat: KakaoChat; onOpen: (chat: KakaoChat) => void }) {
  const t = useT();
  return (
    <li>
      <button
        type="button"
        title={t("kakaotalk.openChat", { name: chat.name })}
        onClick={() => onOpen(chat)}
        className={`flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left ${ROW_HOVER}`}
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-baseline gap-1.5">
            <span className={`truncate text-[13px] ${chat.unread ? "font-medium" : ""}`}>{chat.name}</span>
            {chat.members !== undefined && <span className="shrink-0 text-[11px] text-zinc-500">{chat.members}</span>}
            {chat.time !== undefined && <span className="ml-auto shrink-0 text-[10px] text-zinc-500">{chat.time}</span>}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="min-w-0 flex-1 truncate text-[11px] text-zinc-500">{chat.lastMessage ?? ""}</span>
            {chat.unread !== undefined && chat.unread > 0 && (
              <span className="shrink-0 rounded-full bg-red-600 px-1.5 text-[10px] font-medium leading-4 text-white">{chat.unread}</span>
            )}
          </span>
        </span>
      </button>
    </li>
  );
}

/** The chat list from the KakaoTalk app on this Mac, or what to do to see it. */
function ChatList({ chats, failure, onOpen, onSetUp }: { chats: KakaoChats | undefined; failure: ApiFailure<KakaoErrorCode> | undefined; onOpen: (chat: KakaoChat) => void; onSetUp: () => void }) {
  const t = useT();
  if (chats === undefined) return failure === undefined ? <Message>{t("kakaotalk.reading")}</Message> : <Message tone="error">{kakaoFailureText(t, failure)}</Message>;
  switch (chats.state) {
    case "unsupported":
      return <Message>{t("kakaotalk.unsupported")}</Message>;
    case "not-running":
      return <Message>{t("kakaotalk.notRunning")}</Message>;
    case "no-access":
      return (
        <div className="px-2 py-2 text-xs text-zinc-500">
          <p>
            {t("kakaotalk.noAccess")} {macPermissionText(t, chats.missing)}
          </p>
          <button type="button" className="mt-2 text-teal-700 underline dark:text-teal-400" onClick={onSetUp}>
            {t("tools.setUpInSettings")}
          </button>
        </div>
      );
    case "no-list":
      return <Message>{t(chats.windows === 0 ? "kakaotalk.noWindow" : "kakaotalk.noList")}</Message>;
    case "ok":
      return chats.chats.length === 0 ? (
        <Message>{t("kakaotalk.empty")}</Message>
      ) : (
        <ul>
          {chats.chats.map((chat) => (
            <ChatRow key={`${chat.at.table}:${chat.at.row}:${chat.name}`} chat={chat} onOpen={onOpen} />
          ))}
        </ul>
      );
  }
}

/**
 * ### KakaoTalkPane
 *
 * Sidebar section for KakaoTalk, read only. On a Mac: the chat list the
 * KakaoTalk app shows (read through the Accessibility API; a click opens the
 * chat there), the most recent ones, refreshed every {@link CHATS_POLL_MS}
 * while shown. On any computer the header opens the app. KakaoTalk has no
 * official API for your chats, and sending as you would mean driving the
 * app, which Kakao's terms don't allow, so the section never sends.
 */
export function KakaoTalkPane() {
  const t = useT();
  const workbench = useWorkbenchActions();
  const folded = useContext(StackedSectionContext)?.collapsed === true;
  const visible = usePageVisible();
  const chats = useJson<KakaoChats, KakaoErrorCode>("/api/kakaotalk/chats", { pollMs: folded || !visible ? undefined : CHATS_POLL_MS });
  const [actionError, setActionError] = useState<string | undefined>(undefined);

  async function open(target: KakaoOpenTarget) {
    const failure = await openInApp(target);
    setActionError(failure === undefined ? undefined : kakaoFailureText(t, failure));
    if (failure !== undefined && target.kind === "chat") chats.reload();
  }

  const unread = chats.data !== undefined && "unread" in chats.data ? chats.data.unread : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PaneHeader title={unread !== undefined && unread > 0 ? `${t("section.kakaotalk")} · ${unread}` : t("section.kakaotalk")}>
        <IconButton label={t("kakaotalk.open")} title={t("kakaotalk.openApp")} onClick={() => void open({ kind: "app" })}>
          <ExternalLink size={14} />
        </IconButton>
        <RefreshButton loading={chats.loading} onClick={chats.reload} label={t("kakaotalk.refresh")} />
      </PaneHeader>
      {actionError !== undefined && (
        <div className="mx-2 mb-2 flex items-start gap-1 rounded-md bg-red-50 px-2 py-1 text-[11px] text-red-700 dark:bg-red-950/60 dark:text-red-300">
          <span className="min-w-0 flex-1 break-words">{actionError}</span>
          <button type="button" aria-label={t("ui.dismiss")} className="shrink-0 rounded p-0.5 hover:bg-red-100 dark:hover:bg-red-900" onClick={() => setActionError(undefined)}>
            <X size={12} />
          </button>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-3">
        <ChatList
          chats={chats.data}
          failure={chats.failure}
          onOpen={(chat) => void open({ kind: "chat", name: chat.name, at: chat.at })}
          onSetUp={() => openSettingsPage("connections", () => workbench.open({ kind: "settings" }), "kakaotalk")}
        />
      </div>
    </div>
  );
}
