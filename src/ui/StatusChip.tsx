/**
 * ### ChipTone
 *
 * How a status reads at a glance: nothing to do, working, needs a look, broken.
 */
export type ChipTone = "neutral" | "good" | "warn" | "bad";

const TONE_CLASSES: Record<ChipTone, string> = {
  neutral: "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  good: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300",
  warn: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  bad: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

/**
 * ### StatusChip
 *
 * A small coloured label for a connection's state, such as "Connected".
 */
export function StatusChip({ tone, label }: { tone: ChipTone; label: string }) {
  return <span className={`rounded px-1.5 py-0.5 text-[11px] ${TONE_CLASSES[tone]}`}>{label}</span>;
}
