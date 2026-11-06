"use client";

import type { ReactNode } from "react";
import { SECONDARY_BUTTON } from "@/ui/button";

/**
 * ### SetUpNotice
 *
 * A sidebar section's "not connected" body: the state and the button that
 * fixes it on the first line, the explanation under it. Sections can be
 * short, so the button comes first and only the explanation may be cut off.
 *
 * @param action - The button's words, e.g. "Set up in Settings".
 */
export function SetUpNotice({ title, action, onAction, children }: { title: string; action: string; onAction: () => void; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 px-2 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium text-zinc-700 dark:text-zinc-300">{title}</p>
        <button type="button" onClick={onAction} className={SECONDARY_BUTTON}>
          {action}
        </button>
      </div>
      {children !== undefined && <p className="break-words text-zinc-500">{children}</p>}
    </div>
  );
}
