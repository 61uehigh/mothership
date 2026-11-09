"use client";

import { ChevronRight, Plus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { AddTodo } from "@/features/todos/ui/AddTodo";
import { useFormat } from "@/ui/i18n/format";

/**
 * ### DAILY_LABEL
 *
 * A quiet section label of the Daily tab.
 */
export const DAILY_LABEL = "mb-0.5 flex h-6 items-center gap-1.5 px-2 text-xs font-medium text-zinc-500";

/**
 * ### DAILY_NOTE
 *
 * A muted line under a Daily tab section.
 */
export const DAILY_NOTE = "px-2 py-1 text-xs text-zinc-400 dark:text-zinc-600";

/**
 * ### TIME_COLUMN
 *
 * Fits "10:00 AM" and "오전 10:00" on one line, so the titles beside it stay aligned.
 */
export const TIME_COLUMN = "w-16 shrink-0 whitespace-nowrap text-[11px] tabular-nums";

/**
 * ### TEXT_BUTTON
 *
 * A quiet text button of the Daily tab.
 */
export const TEXT_BUTTON = "flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100";

/**
 * ### useTime
 *
 * @returns A time of day, e.g. "09:30", in the chosen language.
 */
export function useTime(): (epochMs: number) => string {
  const { dateLocale } = useFormat();
  return (epochMs: number) => new Date(epochMs).toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit" });
}

/**
 * ### Section
 *
 * A quiet sentence-case label over a list; `count` is muted and left out at zero.
 */
export function Section({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section className="flex flex-col">
      <h2 className={DAILY_LABEL}>
        {title}
        {count !== undefined && count > 0 && <span className="tabular-nums font-normal text-zinc-400 dark:text-zinc-600">{count}</span>}
      </h2>
      {children}
    </section>
  );
}

/**
 * ### InlineAdd
 *
 * "+ label" as quiet text until clicked, then an input; it folds back when left empty.
 */
export function InlineAdd({ label, placeholder, onAdd }: { label: string; placeholder: string; onAdd: (text: string) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  return open ? (
    <AddTodo placeholder={placeholder} onAdd={onAdd} onClose={() => setOpen(false)} autoFocus />
  ) : (
    <button type="button" className={TEXT_BUTTON} onClick={() => setOpen(true)}>
      <Plus size={12} aria-hidden /> {label}
    </button>
  );
}

/**
 * ### Disclosure
 *
 * A one-row toggle ("Suggestions · 11") over content that stays folded until opened.
 */
export function Disclosure({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="flex flex-col">
      <button type="button" aria-expanded={open} onClick={() => setOpen((shown) => !shown)} className={`${TEXT_BUTTON} font-medium`}>
        <ChevronRight size={12} aria-hidden className={`transition-transform ${open ? "rotate-90" : ""}`} />
        {title}
        {count !== undefined && <span className="font-normal tabular-nums text-zinc-400 dark:text-zinc-600">· {count}</span>}
      </button>
      {open && <div className="flex flex-col">{children}</div>}
    </section>
  );
}
