"use client";

import { ArrowRight, Check, X } from "lucide-react";
import type { Todo, TodoChange } from "@/features/todos/model/Todos";
import { TEXT_BUTTON } from "@/features/todos/ui/dailyLayout";
import { useDayNames } from "@/features/todos/ui/todoRow";
import { SECONDARY_BUTTON } from "@/ui/button";
import { ICON_BUTTON } from "@/ui/iconButtons";
import { useT } from "@/ui/i18n/useT";

/**
 * ### WrapUpPanel
 *
 * The end of the day: what is left on today's plan, each moved to the next
 * workday, to someday, or checked off; or all of it moved at once.
 *
 * @param next - The next workday, `YYYY-MM-DD`.
 */
export function WrapUpPanel({ plan, next, today, onChange, onClose }: { plan: Array<Todo>; next: string; today: string; onChange: (id: string, change: TodoChange) => void; onClose: () => void }) {
  const t = useT();
  const { dayName, dayInText } = useDayNames();
  return (
    <section className="flex flex-col rounded-md bg-zinc-100 py-2 dark:bg-zinc-900">
      <h2 className="mb-1 flex h-7 items-center gap-2 px-3 text-[13px]">
        <span className="flex-1 text-zinc-600 dark:text-zinc-300">{plan.length === 0 ? t("daily.allPlannedDone") : t("daily.leftWhere", { count: plan.length })}</span>
        {plan.length > 0 && (
          <button type="button" className={SECONDARY_BUTTON} onClick={() => plan.forEach((todo) => onChange(todo.id, { plannedFor: next }))}>
            {t("daily.allTo", { day: dayInText(next, today) })}
          </button>
        )}
        <button type="button" className={ICON_BUTTON} aria-label={t("daily.close")} title={t("daily.close")} onClick={onClose}>
          <X size={13} />
        </button>
      </h2>
      <ul>
        {plan.map((todo) => (
          <li key={todo.id} className="flex h-7 items-center gap-1 px-3 text-[13px]">
            <span className="min-w-0 flex-1 truncate">{todo.text}</span>
            <button type="button" className={TEXT_BUTTON} onClick={() => onChange(todo.id, { plannedFor: next })}>
              <ArrowRight size={12} aria-hidden /> {dayName(next, today)}
            </button>
            <button type="button" className={TEXT_BUTTON} onClick={() => onChange(todo.id, { plannedFor: null })}>
              {t("todos.someday")}
            </button>
            <button type="button" className={TEXT_BUTTON} onClick={() => onChange(todo.id, { done: true })}>
              <Check size={12} aria-hidden /> {t("daily.markDone")}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
