import type { ReactNode } from "react";

const SIZE = { pane: "px-2 py-4 text-xs", details: "p-4 text-xs", tab: "p-4 text-sm" } as const;

/**
 * ### Message
 *
 * Placeholder in place of a list or view: loading, empty, or an error, with
 * an optional retry.
 */
export function Message({
  children,
  tone = "muted",
  size = "pane",
  onRetry,
}: {
  children: ReactNode;
  tone?: "muted" | "error";
  /** `pane` in a sidebar, `details` in the column beside a tab, `tab` in the center. */
  size?: keyof typeof SIZE;
  /** Shows a "Try again" link under the message. */
  onRetry?: () => void;
}) {
  const text = <p className={tone === "error" ? "break-words text-red-600 dark:text-red-400" : "text-zinc-500"}>{children}</p>;
  return (
    <div className={SIZE[size]}>
      {text}
      {onRetry !== undefined && (
        <button type="button" className="mt-2 text-teal-700 underline dark:text-teal-400" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
