"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/ui/i18n/useT";
import { showError } from "@/ui/notices";

const SHOWN_MS = 1500;

/**
 * ### CopyButton
 *
 * Copies `text` to the clipboard and says so for a moment, or shows a
 * notice when the browser refuses the write.
 *
 * @param what - Names the copied value for screen readers and the tooltip, e.g. `Redirect URI`.
 * @param labelled - Shows "Copy"/"Copied" next to the icon; otherwise the button is the icon alone.
 */
export function CopyButton({ text, what, labelled = false, className = "" }: { text: string; what: string; labelled?: boolean; className?: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <button
      type="button"
      aria-label={t("ui.copyWhat", { what })}
      title={copied ? t("ui.copied") : t("ui.copyWhat", { what })}
      className={`inline-flex shrink-0 items-center gap-1 rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-[11px] text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 ${className}`}
      onClick={() => {
        // Refused when the page is not focused or clipboard access is denied.
        navigator.clipboard.writeText(text).then(
          () => {
            setCopied(true);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => setCopied(false), SHOWN_MS);
          },
          () => showError(t("ui.copyFailed")),
        );
      }}
    >
      {copied ? <Check size={11} aria-hidden /> : <Copy size={11} aria-hidden />}
      {labelled && (copied ? t("ui.copied") : t("ui.copy"))}
    </button>
  );
}
