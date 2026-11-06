"use client";

import { Check } from "lucide-react";
import { createContext, useContext, type ReactNode } from "react";
import { CopyButton } from "@/ui/CopyButton";

/** Steps under "Optional" get a dash instead of a number. */
const OptionalContext = createContext(false);

/**
 * ### SetupChecklist
 *
 * The numbered steps a connection still needs, one short line each.
 * Numbers come from a CSS counter, so steps shown only in some states
 * keep the count right.
 */
export function SetupChecklist({ children }: { children: ReactNode }) {
  return <ol className="flex flex-col gap-1.5 [counter-reset:setup-step]">{children}</ol>;
}

/**
 * ### SetupStep
 *
 * One step: a ✓ once the app can tell it is done, else its number; a line
 * in imperative voice (keep it under ~60 characters); and its action, such
 * as a link to the exact page, a copyable value, or a field.
 *
 * @param hint - More about the step, shown as the line's tooltip.
 * @param children - The step's action; hidden once it is done unless `keepAction`.
 * @param keepAction - Shows the action on a done step too, e.g. "Sign in again".
 * @param below - A panel under the line, such as choices the step's link depends on.
 * @param wide - Puts the action on its own full-width line, for a text field.
 */
export function SetupStep({
  done,
  label,
  hint,
  keepAction = false,
  below,
  wide = false,
  children,
}: {
  done: boolean;
  label: ReactNode;
  hint?: string;
  keepAction?: boolean;
  below?: ReactNode;
  wide?: boolean;
  children?: ReactNode;
}) {
  const optional = useContext(OptionalContext);
  return (
    <li className="flex min-h-7 flex-wrap items-center gap-x-2 gap-y-1 text-xs [counter-increment:setup-step]">
      {done ? (
        <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-teal-600 text-white" aria-label="Done">
          <Check size={10} strokeWidth={3} aria-hidden />
        </span>
      ) : (
        <span
          aria-hidden
          className={`flex size-4 shrink-0 items-center justify-center rounded-full border border-zinc-300 text-[10px] text-zinc-500 dark:border-zinc-700 ${optional ? "before:content-['–']" : "before:content-[counter(setup-step)]"}`}
        />
      )}
      <span title={hint} className={`min-w-0 ${done ? "text-zinc-500" : "text-zinc-800 dark:text-zinc-200"} ${hint === undefined ? "" : "cursor-help"}`}>
        {label}
      </span>
      {(!done || keepAction) && children !== undefined && <span className={`flex min-w-0 flex-wrap items-center gap-1.5 ${wide ? "basis-full pl-6" : "ml-auto"}`}>{children}</span>}
      {!done && below !== undefined && <div className="basis-full pl-6">{below}</div>}
    </li>
  );
}

/**
 * ### OptionalSteps
 *
 * Steps only some setups need, folded under "Optional".
 *
 * @param open - Starts unfolded, e.g. when one of them is already done.
 */
export function OptionalSteps({ open = false, children }: { open?: boolean; children: ReactNode }) {
  return (
    <details open={open} className="group text-xs">
      <summary className="cursor-pointer select-none text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">Optional</summary>
      <OptionalContext.Provider value>
        <ul className="mt-1.5 flex flex-col gap-1.5">{children}</ul>
      </OptionalContext.Provider>
    </details>
  );
}

/**
 * ### CopyValue
 *
 * A value to paste somewhere else, such as a Redirect URI, with a copy button.
 *
 * @param what - Names the value for the copy button, e.g. `Redirect URI`.
 */
export function CopyValue({ value, what }: { value: string; what: string }) {
  return (
    <span className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-md border border-zinc-300 bg-zinc-100 py-0.5 pr-0.5 pl-2 dark:border-zinc-700 dark:bg-zinc-900">
      <code className="min-w-0 truncate font-mono text-[11px]" title={value}>
        {value}
      </code>
      <CopyButton text={value} what={what} className="border-0 bg-transparent dark:bg-transparent" />
    </span>
  );
}
