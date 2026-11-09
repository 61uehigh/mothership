"use client";

import { Plus } from "lucide-react";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { TODO_TITLE_MAX } from "@/features/todos/model/Todos";

/**
 * ### AddTodo
 *
 * An input that adds a to-do on Enter, used by the to-do list and the Daily
 * tab. Escape, or leaving it empty, calls `onClose`.
 *
 * @param onAdd - Adds the trimmed text; resolves to whether it worked, and the input clears only then.
 * @param trailing - Drawn after the input, given what is typed (the list's due-date picker).
 * @param className - The frame's spacing and border, which differ between the two screens.
 */
export function AddTodo({
  placeholder,
  label = placeholder,
  onAdd,
  onClose,
  autoFocus = false,
  trailing,
  className = "mx-2 mt-0.5 border-zinc-200 text-[13px] dark:border-zinc-800",
}: {
  placeholder: string;
  label?: string;
  onAdd: (text: string) => Promise<boolean>;
  onClose?: () => void;
  autoFocus?: boolean;
  trailing?: (text: string) => ReactNode;
  className?: string;
}) {
  const [text, setText] = useState("");
  // Adding has no id, so a second Enter before the first answers would add the same to-do again.
  const adding = useRef(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (adding.current || text.trim() === "") return;
    adding.current = true;
    try {
      if (await onAdd(text.trim())) setText("");
    } finally {
      adding.current = false;
    }
  }
  return (
    <form onSubmit={(event) => void submit(event)} className={`flex h-7 items-center gap-1.5 rounded-md border px-1.5 focus-within:border-teal-500 ${className}`}>
      <Plus size={13} aria-hidden className="shrink-0 text-zinc-400" />
      <input
        value={text}
        autoFocus={autoFocus}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => text.trim() === "" && onClose?.()}
        onKeyDown={(event) => {
          // Enter while composing Korean picks the character; it must not add the to-do yet.
          if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault();
          if (event.key === "Escape" && !event.nativeEvent.isComposing) onClose?.();
        }}
        placeholder={placeholder}
        aria-label={label}
        maxLength={TODO_TITLE_MAX}
        className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
      />
      {trailing?.(text)}
    </form>
  );
}
