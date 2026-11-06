"use client";

import { SmilePlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { errorMessage } from "@/ui/format";
import { emojiChar, QUICK_REACTIONS } from "@/features/tools/ui/emoji";
import type { Reaction } from "@/features/tools/model/Tools";

/**
 * ### Reactions
 *
 * Emoji reaction pills with an add button. Your own reactions are tinted;
 * clicking one removes it when `onRemove` is given, and clicking someone
 * else's adds yours.
 *
 * @param onAdd - Adds a reaction by shortcode name; omit to make the row read-only.
 * @param onRemove - Removes your reaction by its id (Linear); Slack cannot remove.
 * @param knowsMine - Whether `mine` is reliable. When it is not (Slack does
 *   not say who reacted), existing pills are display-only so clicking one
 *   cannot repeat a reaction you already gave; add through the picker.
 */
export function Reactions({
  reactions,
  onAdd,
  onRemove,
  knowsMine = true,
}: {
  reactions: Array<Reaction>;
  onAdd: ((emoji: string) => Promise<void>) | undefined;
  onRemove?: (reactionId: string) => Promise<void>;
  knowsMine?: boolean;
}) {
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!picking) return;
    const close = (event: PointerEvent) => {
      // A DOM event target is always a Node.
      if (!root.current?.contains(event.target as Node)) setPicking(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [picking]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setPicking(false);
    try {
      await action();
      setError(undefined);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (reactions.length === 0 && onAdd === undefined) return undefined;

  return (
    <div ref={root} className="relative mt-2 flex flex-wrap items-center gap-1">
      {reactions.map((reaction) => {
        const mine = reaction.mine;
        const action =
          mine !== undefined && onRemove !== undefined
            ? () => run(() => onRemove(mine))
            : mine === undefined && onAdd !== undefined && knowsMine
              ? () => run(() => onAdd(reaction.emoji))
              : undefined;
        return (
          <button
            key={reaction.emoji}
            type="button"
            disabled={busy || action === undefined}
            title={`:${reaction.emoji}:${reaction.users.length > 0 ? ` · ${reaction.users.join(", ")}` : ""}`}
            onClick={action}
            className={`rounded-full border px-1.5 text-xs disabled:cursor-default ${
              mine !== undefined
                ? "border-teal-400 bg-teal-50 dark:border-teal-700 dark:bg-teal-950/50"
                : "border-zinc-200 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-500"
            }`}
          >
            {emojiChar(reaction.emoji)} {reaction.count}
          </button>
        );
      })}
      {onAdd !== undefined && (
        <button
          type="button"
          aria-label="Add reaction"
          title="Add reaction"
          disabled={busy}
          onClick={() => setPicking((v) => !v)}
          className="rounded-full border border-transparent p-0.5 text-zinc-500 hover:border-zinc-300 hover:text-zinc-900 disabled:opacity-40 dark:hover:border-zinc-700 dark:hover:text-zinc-100"
        >
          <SmilePlus size={14} className={busy ? "animate-pulse" : undefined} />
        </button>
      )}
      {picking && onAdd !== undefined && (
        <div className="absolute top-7 left-0 z-20 flex gap-0.5 rounded-lg border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          {QUICK_REACTIONS.map((name) => (
            <button
              key={name}
              type="button"
              title={`:${name}:`}
              className="rounded p-1 text-base leading-none hover:bg-zinc-100 dark:hover:bg-zinc-800"
              onClick={() => run(() => onAdd(name))}
            >
              {emojiChar(name)}
            </button>
          ))}
        </div>
      )}
      {error !== undefined && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </div>
  );
}
