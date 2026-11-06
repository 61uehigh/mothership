"use client";

import { X } from "lucide-react";
import { useSyncExternalStore } from "react";
import { useT } from "@/ui/i18n/useT";
import { currentNotices, dismissNotice, subscribeNotices, type Notice } from "@/ui/notices";

const NONE: Array<Notice> = [];

/**
 * ### NoticeStack
 *
 * The corner stack that shows `showError` notices. Mounted once by the app shell, and kept in the page while empty.
 */
export function NoticeStack() {
  const t = useT();
  const notices = useSyncExternalStore(subscribeNotices, currentNotices, () => NONE);
  // Always mounted, even empty: screen readers announce what is added to a live region already on the page.
  return (
    <div role="alert" aria-live="assertive" className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
      {notices.map((notice) => (
        <div
          key={notice.id}
          className="pointer-events-auto flex items-start gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-red-700 shadow-lg dark:border-red-900 dark:bg-zinc-900 dark:text-red-300"
        >
          <p className="flex-1 break-words">
            {notice.message}
            {notice.count > 1 && <span className="ml-1 text-xs text-zinc-500">×{notice.count}</span>}
          </p>
          <button
            type="button"
            aria-label={t("ui.dismiss")}
            className="rounded p-0.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            onClick={() => dismissNotice(notice.id)}
          >
            <X size={14} aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
}
