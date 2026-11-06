"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

const SHOWN_MS = 1500;

/**
 * ### CopyButton
 *
 * Copies `text` to the clipboard and says so for a moment.
 *
 * @param what - Names the copied value for screen readers and the tooltip, e.g. `Redirect URI`.
 * @param labelled - Shows "Copy"/"Copied" next to the icon; otherwise the button is the icon alone.
 */
export function CopyButton({ text, what, labelled = false, className = "" }: { text: string; what: string; labelled?: boolean; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Copy ${what}`}
      title={copied ? "Copied" : `Copy ${what}`}
      className={`inline-flex shrink-0 items-center gap-1 rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-[11px] text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 ${className}`}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), SHOWN_MS);
        });
      }}
    >
      {copied ? <Check size={11} aria-hidden /> : <Copy size={11} aria-hidden />}
      {labelled && (copied ? "Copied" : "Copy")}
    </button>
  );
}
