"use client";

import { LoaderCircle, Send } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { formatBinding } from "@/shell/commands/keys";
import { errorMessage } from "@/ui/format";

/** Unsent text per `draftKey`, for this page load. */
const drafts = new Map<string, string>();

/**
 * ### Composer
 *
 * A text box that sends with a button or ⌘Enter. The text stays when
 * sending fails, with the error shown under it. With `draftKey`, unsent text
 * survives switching tabs (tabs unmount when hidden) until it is sent.
 *
 * @param onSubmit - Sends the text; throws to report a failure.
 * @param options - Controls shown next to the send button (e.g. a reply mode).
 */
export function Composer({
  placeholder,
  submitLabel,
  onSubmit,
  options,
  autoFocus = false,
  onCancel,
  draftKey,
}: {
  placeholder: string;
  submitLabel: string;
  onSubmit: (text: string) => Promise<void>;
  options?: ReactNode;
  autoFocus?: boolean;
  onCancel?: () => void;
  /** Where to keep unsent text, e.g. the tab key plus the thread. */
  draftKey?: string;
}) {
  const [text, setText] = useState(() => (draftKey === undefined ? "" : (drafts.get(draftKey) ?? "")));

  useEffect(() => {
    if (draftKey === undefined) return;
    if (text === "") drafts.delete(draftKey);
    else drafts.set(draftKey, text);
  }, [draftKey, text]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  async function submit() {
    if (text.trim() === "" || sending) return;
    setSending(true);
    try {
      await onSubmit(text.trim());
      // Cleared here as well: if the tab closed while sending, the effect below never runs.
      if (draftKey !== undefined) drafts.delete(draftKey);
      setText("");
      setError(undefined);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-zinc-300 bg-white p-2 focus-within:border-teal-500 dark:border-zinc-700 dark:bg-zinc-900">
      <textarea
        value={text}
        autoFocus={autoFocus}
        rows={3}
        placeholder={placeholder}
        aria-label={placeholder}
        disabled={sending}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void submit();
          } else if (e.key === "Escape" && onCancel !== undefined) {
            onCancel();
          }
        }}
        className="min-h-16 w-full resize-y bg-transparent px-1 text-sm outline-none placeholder:text-zinc-500"
      />
      <div className="flex flex-wrap items-center gap-2">
        {options}
        <span className="ml-auto flex items-center gap-1.5">
          {onCancel !== undefined && (
            <button type="button" onClick={onCancel} className="rounded-md px-2 py-1 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
              Cancel
            </button>
          )}
          <button
            type="button"
            disabled={sending || text.trim() === ""}
            onClick={() => void submit()}
            title={`${submitLabel} (${formatBinding("mod+enter")})`}
            className="flex items-center gap-1.5 rounded-md bg-teal-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-40"
          >
            {sending ? <LoaderCircle size={12} className="animate-spin" aria-hidden /> : <Send size={12} aria-hidden />}
            {submitLabel}
          </button>
        </span>
      </div>
      {error !== undefined && <p className="text-xs break-words text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
