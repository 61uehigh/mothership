import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

const ROW = "flex h-6 w-full items-center gap-1 px-2 text-[11px] font-medium text-zinc-500";

/**
 * ### GroupHeader
 *
 * The title of a group of rows inside a sidebar pane, such as Inbox's Today
 * or a meeting collection: the name and its count, starting at the rows' own
 * left edge so the group never sits further in than what it holds. A group
 * that folds takes `onToggle`; its chevron sits at the right end, out of the
 * way of the name.
 *
 * @param note - Quiet text at the right, such as "2 done".
 * @param tooltip - The full name, when it may be cut short.
 */
export function GroupHeader({
  title,
  count,
  note,
  tooltip,
  open = true,
  onToggle,
}: {
  title: ReactNode;
  count?: number;
  note?: ReactNode;
  tooltip?: string;
  open?: boolean;
  onToggle?: () => void;
}) {
  const content = (
    <>
      <span className="min-w-0 truncate">{title}</span>
      {count !== undefined && <span className="shrink-0 tabular-nums text-zinc-400 dark:text-zinc-500">{count}</span>}
      <span className="flex-1" />
      {note !== undefined && <span className="shrink-0 font-normal tabular-nums">{note}</span>}
    </>
  );
  if (onToggle === undefined) {
    return (
      <h2 className={ROW} title={tooltip}>
        {content}
      </h2>
    );
  }
  return (
    <h2>
      <button type="button" aria-expanded={open} title={tooltip} onClick={onToggle} className={`${ROW} text-left hover:text-zinc-900 dark:hover:text-zinc-100`}>
        {content}
        <ChevronRight size={12} aria-hidden className={`shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
    </h2>
  );
}
