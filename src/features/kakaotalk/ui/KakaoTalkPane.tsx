"use client";

import { ExternalLink, Send, X } from "lucide-react";
import { useContext, useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import { IconButton, RefreshButton } from "@/ui/IconButton";
import { Message } from "@/ui/Message";
import { relativeTime } from "@/ui/format";
import { fetchJson, fetchText, jsonRequest, useJson } from "@/ui/useJson";
import { useNow } from "@/ui/useNow";
import { usePageVisible } from "@/ui/usePageVisible";
import { SETTINGS_CHANGED_EVENT } from "@/shell/events";
import { PaneHeader, StackedSectionContext } from "@/shell/PaneHeader";
import { useWorkbenchActions } from "@/shell/WorkbenchContext";
import { MEMO_MAX_CHARS, type KakaoChat, type KakaoChats, type KakaoOpenTarget, type KakaoStatus } from "@/features/kakaotalk/model/KakaoTalk";
import { openSettingsPage } from "@/shell/settingsPage";
import { ROW_HOVER } from "@/ui/selection";

/** Reading the window takes several seconds (the app answers each element separately), so the list refreshes less often than other sections. */
const CHATS_POLL_MS = 30_000;
/** Picks up a sign-in finished in another browser tab. */
const STATUS_POLL_MS = 30_000;
const SENT_SHOWN = 5;

const HEADING = "px-2 pb-1 pt-3 text-[11px] font-medium text-zinc-500";

async function openInApp(target: KakaoOpenTarget): Promise<string | undefined> {
  const result = await fetchText("/api/kakaotalk/open", jsonRequest("POST", target));
  return result.ok ? undefined : result.error;
}

/** Writes a note and sends it to your own KakaoTalk chat; ⌘/Ctrl+Enter sends. */
function MemoComposer({ onSent }: { onSent: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const length = [...text].length;
  const tooLong = length > MEMO_MAX_CHARS;

  async function send() {
    if (text.trim() === "" || tooLong || busy) return;
    setBusy(true);
    const result = await fetchJson("/api/kakaotalk/memo", jsonRequest("POST", { text }));
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(undefined);
    setText("");
    onSent();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void send();
    }
  }

  return (
    <div className="px-2 pt-1">
      <div className="flex items-end gap-1 rounded-md border border-zinc-300 bg-white px-2 py-1 focus-within:border-teal-500 dark:border-zinc-700 dark:bg-zinc-950">
        <textarea
          aria-label="Note to send to yourself on KakaoTalk"
          placeholder="Send a note to yourself… (⌘↵)"
          rows={2}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          className="min-h-0 flex-1 resize-none bg-transparent text-[13px] outline-none placeholder:text-zinc-400"
        />
        <IconButton label="Send to me" title="Send to my KakaoTalk (⌘↵)" disabled={busy || text.trim() === "" || tooLong} onClick={() => void send()}>
          <Send size={14} className={busy ? "animate-pulse" : undefined} />
        </IconButton>
      </div>
      {tooLong && <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{`${length}/${MEMO_MAX_CHARS} characters: shorten the note to send it.`}</p>}
      {error !== undefined && (
        <p role="alert" className="mt-1 flex items-start gap-1 text-[11px] text-red-600 dark:text-red-400">
          <span className="min-w-0 flex-1 break-words">{error}</span>
          <button type="button" aria-label="Dismiss" className="shrink-0 rounded p-0.5 hover:bg-red-100 dark:hover:bg-red-900" onClick={() => setError(undefined)}>
            <X size={12} />
          </button>
        </p>
      )}
    </div>
  );
}

function ChatRow({ chat, onOpen }: { chat: KakaoChat; onOpen: (chat: KakaoChat) => void }) {
  return (
    <li>
      <button
        type="button"
        title={`Open ${chat.name} in KakaoTalk`}
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
function ChatList({ chats, error, onOpen, onAccessibility }: { chats: KakaoChats | undefined; error: string | undefined; onOpen: (chat: KakaoChat) => void; onAccessibility: () => void }) {
  if (chats === undefined) return error === undefined ? <Message>Reading KakaoTalk…</Message> : <Message tone="error">{error}</Message>;
  switch (chats.state) {
    case "unsupported":
      return null;
    case "not-running":
      return <Message>KakaoTalk isn&apos;t open. Open it to see your chats here.</Message>;
    case "no-access":
      return (
        <div className="px-2 py-2 text-xs text-zinc-500">
          <p>Reading chats needs a permission on this Mac. {chats.detail}</p>
          <button type="button" className="mt-2 text-teal-700 underline dark:text-teal-400" onClick={onAccessibility}>
            Open Accessibility settings
          </button>
        </div>
      );
    case "no-list":
      return <Message>Open the 채팅 (Chats) tab in KakaoTalk&apos;s main window to see your chats here.</Message>;
    case "ok":
      return chats.chats.length === 0 ? (
        <Message>No chats in KakaoTalk&apos;s list.</Message>
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
 * Sidebar section for KakaoTalk. On any computer: send a note to your own
 * KakaoTalk chat ("나와의 채팅") through Kakao's official API, see the notes
 * you sent, and open the app. On a Mac, also the chat list the KakaoTalk app
 * shows (read through the Accessibility API; a click opens the chat there),
 * the most recent ones, refreshed every {@link CHATS_POLL_MS} while shown.
 * KakaoTalk has no official API for reading chats, so elsewhere the list is
 * not offered.
 */
export function KakaoTalkPane() {
  const workbench = useWorkbenchActions();
  const folded = useContext(StackedSectionContext)?.collapsed === true;
  const visible = usePageVisible();
  const status = useJson<KakaoStatus>("/api/kakaotalk", { pollMs: folded || !visible ? undefined : STATUS_POLL_MS });
  const onMac = status.data?.platform === "mac";
  const chats = useJson<KakaoChats>(onMac ? "/api/kakaotalk/chats" : undefined, { pollMs: folded || !visible ? undefined : CHATS_POLL_MS });
  const [actionError, setActionError] = useState<string | undefined>(undefined);
  const reloadStatus = status.reload;

  // A key saved or a sign-in removed in Settings shows here at once.
  useEffect(() => {
    window.addEventListener(SETTINGS_CHANGED_EVENT, reloadStatus);
    return () => window.removeEventListener(SETTINGS_CHANGED_EVENT, reloadStatus);
  }, [reloadStatus]);

  async function open(target: KakaoOpenTarget) {
    const error = await openInApp(target);
    setActionError(error);
    if (error !== undefined && target.kind === "chat") chats.reload();
  }

  const unread = chats.data !== undefined && "unread" in chats.data ? chats.data.unread : undefined;
  const now = useNow(60_000);

  let memo: ReactNode;
  if (status.data === undefined) {
    memo = status.error === undefined ? <Message>Loading…</Message> : <Message tone="error" onRetry={status.reload}>{status.error}</Message>;
  } else if (!status.data.memo.connected) {
    memo = (
      <div className="px-2 py-2 text-xs text-zinc-500">
        <p>{status.data.memo.keySet ? "Sign in with Kakao to send notes to yourself." : "Connect Kakao to send notes to your own KakaoTalk chat."}</p>
        <button
          type="button"
          className="mt-2 text-teal-700 underline dark:text-teal-400"
          onClick={() => openSettingsPage("connections", () => workbench.open({ kind: "settings" }))}
        >
          Set up in Settings → Connections
        </button>
      </div>
    );
  } else {
    const sent = status.data.sent.slice(0, SENT_SHOWN);
    memo = (
      <>
        <MemoComposer onSent={status.reload} />
        {sent.length > 0 && (
          <ul className="mt-1">
            {sent.map((note) => (
              <li key={note.id} className="flex items-baseline gap-2 px-2 py-0.5 text-[11px] text-zinc-500" title={note.text}>
                <span className="min-w-0 flex-1 truncate">{note.text}</span>
                <span className="shrink-0 text-[10px]">{relativeTime(Date.parse(note.sentAt), now)}</span>
              </li>
            ))}
          </ul>
        )}
      </>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PaneHeader title={unread !== undefined && unread > 0 ? `KakaoTalk · ${unread}` : "KakaoTalk"}>
        <IconButton label="Open KakaoTalk" title="Open the KakaoTalk app" onClick={() => void open({ kind: "app" })}>
          <ExternalLink size={14} />
        </IconButton>
        <RefreshButton
          loading={status.loading || (onMac && chats.loading)}
          onClick={() => {
            status.reload();
            if (onMac) chats.reload();
          }}
        />
      </PaneHeader>
      {actionError !== undefined && (
        <div className="mx-2 mb-2 flex items-start gap-1 rounded-md bg-red-50 px-2 py-1 text-[11px] text-red-700 dark:bg-red-950/60 dark:text-red-300">
          <span className="min-w-0 flex-1 break-words">{actionError}</span>
          <button type="button" aria-label="Dismiss" className="shrink-0 rounded p-0.5 hover:bg-red-100 dark:hover:bg-red-900" onClick={() => setActionError(undefined)}>
            <X size={12} />
          </button>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-3">
        <h4 className={HEADING}>Note to self</h4>
        {memo}
        {onMac && (
          <>
            <h4 className={HEADING}>Chats on this Mac</h4>
            <ChatList
              chats={chats.data}
              error={chats.error}
              onOpen={(chat) => void open({ kind: "chat", name: chat.name, at: chat.at })}
              onAccessibility={() => void open({ kind: "accessibility" })}
            />
          </>
        )}
      </div>
    </div>
  );
}
