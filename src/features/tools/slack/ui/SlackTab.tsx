"use client";

import { Hash, MessageSquare, Paperclip } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { relativeTime } from "@/ui/format";
import { useShell } from "@/shell/ShellContext";
import { draftFor } from "@/features/tools/ui/delegation";
import { Markdown } from "@/shell/Markdown";
import { slackHandOffItem } from "@/features/tools/ui/handOff";
import { Composer } from "@/features/tools/ui/Composer";
import { Reactions } from "@/features/tools/ui/Reactions";
import { HandOffButton, postTool, useToolDocument } from "@/features/tools/ui/toolDoc";
import { SegmentedControl } from "@/ui/SegmentedControl";
import { Chip, TabFrame } from "@/shell/TabFrame";
import type { SlackThread } from "@/features/tools/model/Tools";
import { useNow } from "@/ui/useNow";
import type { Tab } from "@/shell/tabs";

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
  const { openNewAgent } = useShell();
  const now = useNow(CLOCK_TICK_MS);
  const state = useToolDocument<SlackThread>(`/api/tools/slack/thread?url=${encodeURIComponent(tab.url)}`);
  const thread = state.data;
  const focused = useRef<HTMLDivElement>(null);
  const replies = thread === undefined ? 0 : thread.messages.length - 1;
  // `undefined` until you pick: a thread with replies defaults to replying in it, a lone message to the conversation.
  const [pickedMode, setMode] = useState<"thread" | "conversation" | undefined>(undefined);
  const mode = pickedMode ?? (replies > 0 ? "thread" : "conversation");
  const [broadcast, setBroadcast] = useState(false);

  async function send(text: string) {
    if (thread === undefined) return;
    await postTool("/api/tools/slack/send", {
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
      title={tab.title}
      chips={
        thread !== undefined && (
          <>
            <Chip>
              <Hash size={11} aria-hidden />
              {thread.channelId.startsWith("D") ? "Direct message" : thread.channelId}
            </Chip>
            <Chip>
              <MessageSquare size={11} aria-hidden />
              {replies === 0 ? "No replies" : `${replies}${thread.truncated ? "+" : ""} ${replies === 1 ? "reply" : "replies"}`}
            </Chip>
          </>
        )
      }
      open={{ label: "Open in Slack", url: tab.url }}
      actions={<HandOffButton onHandOff={thread === undefined ? undefined : () => openNewAgent(draftFor("slack", slackHandOffItem(thread)))} />}
      state={state}
    >
      {thread !== undefined && (
        <div className="flex flex-col gap-3">
          {thread.messages.map((message, index) => {
            const focus = message.ts === thread.focusTs && thread.messages.length > 1;
            return (
              <div key={message.ts} className={index === 0 ? "" : "ml-6"}>
                {index === 1 && <h2 className="mb-2 text-xs font-medium text-zinc-500">Replies</h2>}
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
                      <span className="text-zinc-500" title={new Date(message.at).toLocaleString()}>
                        {relativeTime(message.at, now)}
                      </span>
                    )}
                  </div>
                  {message.markdown === "" ? <p className="text-sm text-zinc-500">(no text)</p> : <Markdown>{message.markdown}</Markdown>}
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
                      await postTool("/api/tools/slack/reaction", { channelId: thread.channelId, ts: message.ts, emoji });
                      state.reload();
                    }}
                  />
                </div>
              </div>
            );
          })}
          {thread.truncated && <p className="text-xs text-zinc-500">Older replies are not shown. Open the thread in Slack to see everything.</p>}
          <div className="sticky bottom-0 bg-zinc-50 pt-2 pb-1 dark:bg-[#0c0c0e]">
            <Composer
              placeholder={mode === "thread" ? "Reply in thread" : thread.channelId.startsWith("D") ? "Message this person" : "Message this channel"}
              submitLabel="Send"
              draftKey={`slack:${tab.url}`}
              onSubmit={send}
              options={
                <>
                  <SegmentedControl
                    label="Where to send"
                    value={mode}
                    options={[
                      { value: "thread", label: "Reply in thread" },
                      { value: "conversation", label: thread.channelId.startsWith("D") ? "Send in DM" : "Send to channel" },
                    ]}
                    onChange={setMode}
                    className="flex rounded-md bg-zinc-100 p-0.5 text-xs dark:bg-zinc-800"
                    optionClassName={(selected) => `rounded px-2 py-0.5 ${selected ? "bg-white shadow-sm dark:bg-zinc-700" : "text-zinc-500"}`}
                  />
                  {mode === "thread" && (
                    <label className="flex items-center gap-1 text-xs text-zinc-500">
                      <input type="checkbox" checked={broadcast} onChange={(e) => setBroadcast(e.target.checked)} />
                      Also send to the conversation
                    </label>
                  )}
                </>
              }
            />
          </div>
        </div>
      )}
    </TabFrame>
  );
}
