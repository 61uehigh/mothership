"use client";

import { Hash, MessageSquare, Paperclip, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useFormat } from "@/ui/i18n/format";
import { useT } from "@/ui/i18n/useT";
import { itemTitle } from "@/ui/i18n/itemTitle";
import { useShell } from "@/shell/shellContext";
import { useWorkbenchActions } from "@/shell/workbenchContext";
import { draftFor } from "@/features/tools/ui/delegation";
import { Markdown } from "@/shell/Markdown";
import { slackHandOffItem } from "@/features/tools/ui/handOff";
import { Composer } from "@/features/tools/ui/Composer";
import { SLACK_MESSAGE_MAX } from "@/features/tools/model/Tools";
import { Reactions } from "@/features/tools/ui/Reactions";
import { HandOffButton, postTool, useToolDocument } from "@/features/tools/ui/toolDoc";
import { SegmentedControl } from "@/ui/SegmentedControl";
import { Chip, TabFrame } from "@/shell/tabFrame";
import type { SlackThread } from "@/features/tools/model/Tools";
import { useNow } from "@/ui/useNow";
import type { Tab } from "@/shell/tabs";
import { SELECTED_SEGMENT, UNSELECTED_SEGMENT } from "@/ui/selection";

const CLOCK_TICK_MS = 30_000;

/**
 * ### SlackTab
 *
 * Center tab showing a Slack message with its whole thread, read through
 * `GET /api/tools/slack/thread`. The opened message is highlighted and
 * scrolled into view. You can react to any message and reply in the thread
 * or to the conversation.
 */
export function SlackTab({ tab }: { tab: Extract<Tab, { kind: "slack" }> }) {
  const t = useT();
  const { relativeTime, dateLocale } = useFormat();
  const { openNewAgent } = useShell();
  const now = useNow(CLOCK_TICK_MS);
  const state = useToolDocument<SlackThread>(`/api/tools/slack/thread?${new URLSearchParams({ url: tab.url, ...(tab.since === undefined ? {} : { since: tab.since }) })}`, "slack");
  const thread = state.data;
  const focused = useRef<HTMLDivElement>(null);
  const replies = thread === undefined ? 0 : thread.messages.length - 1;
  // `undefined` until you pick: a thread with replies defaults to replying in it, a lone message to the conversation.
  const [pickedMode, setMode] = useState<"thread" | "conversation" | undefined>(undefined);
  // A stretch of a conversation (a grouped Inbox row) is answered in the conversation, not in a thread.
  const mode = thread?.conversation === true ? "conversation" : (pickedMode ?? (replies > 0 ? "thread" : "conversation"));
  const [broadcast, setBroadcast] = useState(false);
  const dm = thread?.channelId.startsWith("D") === true;
  // The tab strip shows `tab.title`, which an Inbox row without text left empty: name it as the header does.
  const { update } = useWorkbenchActions();
  const partner = thread?.partner;
  useEffect(() => {
    if (partner !== undefined && partner !== tab.title) update({ ...tab, title: partner });
  }, [partner, tab, update]);

  async function send(text: string) {
    if (thread === undefined) return;
    await postTool("slack", "/api/tools/slack/send", {
      channelId: thread.channelId,
      text,
      ...(mode === "thread" ? { threadTs: thread.messages[0].ts, broadcast } : {}),
    });
    state.reload();
  }

  // Scroll to the opened message once; reloads after a reply or reaction keep your scroll position.
  const scrolled = useRef(false);
  useEffect(() => {
    if (scrolled.current || thread === undefined) return;
    scrolled.current = true;
    if (thread.messages.length > 1) focused.current?.scrollIntoView({ block: "center" });
  }, [thread]);

  return (
    <TabFrame
      // A DM is named after who you talk to (a person or an app such as Linear), as Slack does.
      title={thread?.partner ?? itemTitle(t, tab.title)}
      chips={
        thread !== undefined && (
          <>
            <Chip>
              {dm ? <User size={11} aria-hidden /> : <Hash size={11} aria-hidden />}
              {dm ? t("slack.directMessage") : thread.channelId}
            </Chip>
            <Chip>
              <MessageSquare size={11} aria-hidden />
              {thread.conversation
                ? t("slack.messages", { count: `${thread.messages.length}${thread.truncated ? "+" : ""}` })
                : replies === 0
                  ? t("slack.noReplies")
                  : t(replies === 1 && !thread.truncated ? "slack.replies.one" : "slack.replies.other", { count: `${replies}${thread.truncated ? "+" : ""}` })}
            </Chip>
          </>
        )
      }
      open={{ label: t("slack.openIn"), url: tab.url }}
      actions={<HandOffButton onHandOff={thread === undefined ? undefined : () => openNewAgent(draftFor("slack", slackHandOffItem(thread)))} />}
      state={state}
    >
      {thread !== undefined && (
        <div className="flex flex-col gap-3">
          {thread.messages.map((message, index) => {
            const focus = message.ts === thread.focusTs && thread.messages.length > 1;
            return (
              // A conversation is a flat run of messages; a thread indents its replies under the parent.
              <div key={message.ts} className={index === 0 || thread.conversation ? "" : "ml-6"}>
                {index === 1 && !thread.conversation && <h2 className="mb-2 text-xs font-medium text-zinc-500">{t("slack.repliesHeading")}</h2>}
                <div
                  ref={focus ? focused : undefined}
                  className={`rounded-lg border px-3.5 py-2.5 ${
                    focus
                      ? "border-teal-400 bg-teal-50/60 dark:border-teal-700 dark:bg-teal-950/30"
                      : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                  }`}
                >
                  <div className="mb-1.5 flex items-baseline gap-2 text-xs">
                    <span className="font-medium text-zinc-800 dark:text-zinc-200">{message.from}</span>
                    {now > 0 && message.at !== undefined && (
                      <span className="whitespace-nowrap text-zinc-500" title={new Date(message.at).toLocaleString(dateLocale)}>
                        {relativeTime(message.at, now)}
                      </span>
                    )}
                  </div>
                  {message.markdown === "" && message.context.length === 0 ? (
                    <p className="text-sm text-zinc-500">{t("slack.noText")}</p>
                  ) : (
                    <Markdown>{message.markdown}</Markdown>
                  )}
                  {/* Slack's context line under an app's message: small, muted, its elements side by side. */}
                  {message.context.length > 0 && (
                    <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                      {message.context.map((part, i) => (
                        <span key={i}>{part}</span>
                      ))}
                    </p>
                  )}
                  {message.files.length > 0 && (
                    <ul className="mt-2 flex flex-col gap-1">
                      {message.files.map((file) => (
                        <li key={file} className="flex items-center gap-1.5 text-xs text-zinc-500">
                          <Paperclip size={12} aria-hidden />
                          {file}
                        </li>
                      ))}
                    </ul>
                  )}
                  <Reactions
                    knowsMine={false}
                    reactions={message.reactions.map((r) => ({ emoji: r.name, count: r.count, users: [], mine: undefined }))}
                    onAdd={async (emoji) => {
                      await postTool("slack", "/api/tools/slack/reaction", { channelId: thread.channelId, ts: message.ts, emoji });
                      state.reload();
                    }}
                  />
                </div>
              </div>
            );
          })}
          {thread.truncated && <p className="text-xs text-zinc-500">{t(thread.conversation ? "slack.truncatedConversation" : "slack.truncatedThread")}</p>}
          <div className="sticky bottom-0 bg-zinc-50 pt-2 pb-1 dark:bg-[#0c0c0e]">
            <Composer
              placeholder={
                mode === "thread"
                  ? t("slack.placeholder.thread")
                  : !dm
                    ? t("slack.placeholder.channel")
                    : thread.partner === undefined
                      ? t("slack.placeholder.dm")
                      : t("slack.placeholder.named", { name: thread.partner })
              }
              submitLabel={t("slack.send")}
              draftKey={`slack:${tab.url}`}
              maxLength={SLACK_MESSAGE_MAX}
              onSubmit={send}
              options={
                thread.conversation ? undefined : (
                <>
                  <SegmentedControl
                    label={t("slack.whereToSend")}
                    value={mode}
                    options={[
                      { value: "thread", label: t("slack.mode.thread") },
                      { value: "conversation", label: t(dm ? "slack.mode.dm" : "slack.mode.channel") },
                    ]}
                    onChange={setMode}
                    className="flex rounded-md bg-zinc-100 p-0.5 text-xs dark:bg-zinc-800"
                    optionClassName={(selected) => `rounded px-2 py-0.5 ${selected ? SELECTED_SEGMENT : UNSELECTED_SEGMENT}`}
                  />
                  {mode === "thread" && (
                    <label className="flex items-center gap-1 text-xs text-zinc-500">
                      <input type="checkbox" checked={broadcast} onChange={(e) => setBroadcast(e.target.checked)} />
                      {t("slack.broadcast")}
                    </label>
                  )}
                </>
                )
              }
            />
          </div>
        </div>
      )}
    </TabFrame>
  );
}
