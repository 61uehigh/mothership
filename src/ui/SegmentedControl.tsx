"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";

/**
 * ### SegmentOption
 *
 * One choice of a {@link SegmentedControl}.
 */
export type SegmentOption<V extends string> = { value: V; label: ReactNode; title?: string };

const NEXT_KEYS: Record<string, number | "first" | "last"> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
  Home: "first",
  End: "last",
};

/**
 * ### SegmentedControl
 *
 * A radio group drawn as buttons. Only the chosen option is in the tab
 * order; arrow keys, Home, and End move between options.
 *
 * @param activation - `auto` (default) chooses the option arrow keys move
 *   to. `manual` only moves focus, and Enter, Space, or a click chooses: for
 *   choices with side effects, such as sending an RSVP.
 * @param className - Classes of the group.
 * @param optionClassName - Classes of one option.
 */
export function SegmentedControl<V extends string>({
  label,
  value,
  options,
  onChange,
  activation = "auto",
  disabled = false,
  className,
  optionClassName,
}: {
  /** Accessible name of the group. */
  label: string;
  /** The chosen option; `undefined` when none is. */
  value: V | undefined;
  options: ReadonlyArray<SegmentOption<V>>;
  onChange: (value: V) => void;
  activation?: "auto" | "manual";
  disabled?: boolean;
  className?: string;
  optionClassName: (selected: boolean) => string;
}) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const chosen = options.findIndex((o) => o.value === value);
  // With nothing chosen, the first option takes the tab stop.
  const tabStop = chosen === -1 ? 0 : chosen;

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const move = NEXT_KEYS[event.key];
    if (move === undefined) return;
    event.preventDefault();
    const next = move === "first" ? 0 : move === "last" ? options.length - 1 : (index + move + options.length) % options.length;
    buttons.current[next]?.focus();
    if (activation === "auto") onChange(options[next].value);
  }

  return (
    <span role="radiogroup" aria-label={label} className={className}>
      {options.map((option, index) => (
        <button
          key={option.value}
          ref={(element) => {
            buttons.current[index] = element;
          }}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          tabIndex={index === tabStop ? 0 : -1}
          title={option.title}
          disabled={disabled}
          onClick={() => onChange(option.value)}
          onKeyDown={(event) => onKeyDown(event, index)}
          className={optionClassName(option.value === value)}
        >
          {option.label}
        </button>
      ))}
    </span>
  );
}
