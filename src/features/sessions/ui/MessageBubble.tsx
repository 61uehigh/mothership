import { memo } from "react";
import type { AgentMessage } from "@/features/sessions/model/Agent";

/**
 * ### MessageBubble
 *
 * A message sent to the session, right-aligned. A queued one (not yet
 * delivered) is dashed and says so; one from mothership or another agent is
 * labelled with its sender.
 */
export const MessageBubble = memo(function MessageBubble({
  message,
  senderName,
}: {
  message: AgentMessage;
  /** The sending agent's name, when `message.senderId` names an agent that is still known. */
  senderName: string | undefined;
}) {
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
            {message.kind === "report" ? "Report · " : "from "}
            {senderName}
          </p>
        )
      )}
      <p className="whitespace-pre-wrap break-words">{message.text}</p>
      {message.deliveredAt === undefined && <p className="mt-1 text-[11px]">Queued</p>}
    </div>
  );
});
