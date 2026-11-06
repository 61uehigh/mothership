"use client";

import { useState, type RefObject } from "react";
import { formatBinding } from "@/shell/commands/keys";
import type { Agent } from "@/features/sessions/model/Agent";
import { fetchText, jsonRequest } from "@/ui/useJson";
import { agentModelLabel } from "@/features/sessions/ui/sessionActions";
import { useT } from "@/ui/i18n/useT";

/**
 * ### ReplyComposer
 *
 * Writes a message to the session; Mod+Enter or Send sends it. While the
 * agent works the message is queued. The text is cleared only once the
 * server accepts it, so a failed send keeps what you wrote and says why
 * under the box (e.g. the server's limit on queued messages).
 *
 * After a turn, the agent's suggested next prompt shows in grey in the empty
 * box; Tab fills it in to edit or send. Otherwise Tab moves focus as usual.
 */
export function ReplyComposer({ agent, ref }: { agent: Agent; ref: RefObject<HTMLTextAreaElement | null> }) {
  const t = useT();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  /** The suggested next prompt, while the box is empty and the agent is not working. */
  const suggestion = draft === "" && agent.status !== "running" ? agent.suggestion : undefined;

  async function send() {
    const text = draft.trim();
    if (text === "") return;
    setSending(true);
    setError(undefined);
    const result = await fetchText(`/api/agents/${agent.id}/messages`, jsonRequest("POST", { text }));
    setSending(false);
    // The box stays editable while sending; keep anything typed meanwhile.
    if (result.ok) setDraft((current) => (current.trim() === text ? "" : current));
    else setError(result.error);
  }

  return (
    <div className="border-t border-zinc-200 p-3 dark:border-zinc-800">
      <div className="mx-auto max-w-3xl rounded-xl border border-zinc-300 bg-white focus-within:border-teal-500 dark:border-zinc-700 dark:bg-zinc-900">
        <textarea
          ref={ref}
          id="agent-composer"
          className="block min-h-14 w-full resize-none bg-transparent px-3.5 py-2.5 text-sm outline-none"
          rows={2}
          placeholder={
            suggestion ?? (agent.status === "running" ? t("sessions.composer.queuedPlaceholder") : t("sessions.composer.placeholder", { name: agent.name }))
          }
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !sending) void send();
            // A plain Tab outside IME composition; any other Tab moves focus as usual.
            const plainTab = e.key === "Tab" && !e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey && !e.nativeEvent.isComposing;
            if (plainTab && suggestion !== undefined) {
              e.preventDefault();
              setDraft(suggestion);
            }
          }}
        />
        <div className="flex items-center gap-2 px-3 pb-2 text-[11px] text-zinc-500">
          <span className="font-mono">{agentModelLabel(agent)}</span>
          {suggestion !== undefined && (
            <span className="truncate">
              <kbd className="rounded border border-zinc-300 px-1 font-sans dark:border-zinc-700">Tab</kbd>{" "}
              {t("sessions.composer.useSuggestion")}
            </span>
          )}
          <button
            type="button"
            disabled={sending || draft.trim() === ""}
            className="ml-auto rounded-md bg-teal-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-40"
            onClick={() => void send()}
          >
            {t("sessions.composer.send", { key: formatBinding("mod+enter") })}
          </button>
        </div>
      </div>
      {error !== undefined && (
        <p role="alert" className="mx-auto mt-1.5 max-w-3xl break-words text-xs text-red-600 dark:text-red-400">
          {t("sessions.composer.sendFailed", { error })}
        </p>
      )}
    </div>
  );
}
