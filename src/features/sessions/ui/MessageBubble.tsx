import { memo, useState } from "react";
import type { AgentMessage } from "@/features/sessions/model/Agent";
import { reportFailure } from "@/ui/notices";
import { fetchText } from "@/ui/useJson";
import { useT } from "@/ui/i18n/useT";

/**
 * ### MessageBubble
 *
 * A message sent to the session, right-aligned. A queued one (not yet
 * delivered) is dashed and says so, with Cancel to take it back before its
 * turn starts; one from mothership or another agent is labelled with its sender.
 */
export const MessageBubble = memo(function MessageBubble({
  message,
  senderName,
}: {
  message: AgentMessage;
  /** The sending agent's name, when `message.senderId` names an agent that is still known. */
  senderName: string | undefined;
}) {
  const t = useT();
  return (
    <div
      className={`max-w-[85%] self-end rounded-xl px-3.5 py-2.5 text-sm ${
        message.deliveredAt === undefined ? "border border-dashed border-zinc-300 text-zinc-500 dark:border-zinc-700" : "bg-zinc-100 dark:bg-zinc-800"
      }`}
    >
      {message.kind === "system" ? (
        <p className="mb-1 text-[11px] text-amber-600 dark:text-amber-400">mothership</p>
      ) : (
        message.senderId !== undefined && (
          <p className="mb-1 text-[11px] text-violet-500">
            {message.kind === "report" ? t("sessions.message.report", { name: senderName ?? "" }) : t("sessions.message.from", { name: senderName ?? "" })}
          </p>
        )
      )}
      <p className="whitespace-pre-wrap break-words">{message.text}</p>
      {message.deliveredAt === undefined && <QueuedLine message={message} />}
    </div>
  );
});

/** "Queued", and Cancel, which removes the message; the live update drops it from the list. */
function QueuedLine({ message }: { message: AgentMessage }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  async function cancel() {
    setBusy(true);
    const result = await fetchText(`/api/agents/${message.agentId}/messages/${message.id}`, { method: "DELETE" });
    reportFailure(t("sessions.message.cancelFailed"), result);
    setBusy(false);
  }
  return (
    <p className="mt-1 flex h-4 items-center gap-2 text-[11px]">
      {t("sessions.message.queued")}
      <button
        type="button"
        disabled={busy}
        onClick={() => void cancel()}
        className="text-zinc-500 underline decoration-zinc-400/50 underline-offset-2 hover:text-zinc-900 disabled:opacity-50 dark:hover:text-zinc-100"
      >
        {t("ui.cancel")}
      </button>
    </p>
  );
}
