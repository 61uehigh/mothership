import { hasModifier } from "@/shell/commands/keys";

/**
 * ### CHORD_TIMEOUT_MS
 *
 * How long after the first step of a chord (`g` of `g h`) the second may follow.
 */
export const CHORD_TIMEOUT_MS = 1000;

/** Keys a focused control uses itself: Enter and Space press it, arrows move within it. */
const CONTROL_KEYS = new Set(["enter", "space", "up", "down", "left", "right", "home", "end"]);

/**
 * ### KeyContext
 *
 * Where a key press landed: in a text field (`typing`), on a control that
 * answers Enter, Space, and arrows itself (`control`), or with a modal
 * dialog open (`modal`).
 */
export type KeyContext = { typing: boolean; control: boolean; modal: boolean };

/**
 * ### chordPrefix
 *
 * @param pending - The step that may start a chord and when it was pressed, if any.
 * @param now - Milliseconds, the time of the current press.
 * @returns The pending step while the chord can still be finished, else `undefined`.
 */
export function chordPrefix(pending: { step: string; at: number } | undefined, now: number): string | undefined {
  return pending !== undefined && now - pending.at < CHORD_TIMEOUT_MS ? pending.step : undefined;
}

/**
 * ### matchCommand
 *
 * Picks the command a key press runs. A chord finished by `step` wins
 * over a single-step binding. When several commands share a binding, the
 * highest `priority` wins, then the most recently registered. Single keys
 * are ignored while typing; in a modal dialog only `mod`/`alt` bindings
 * pass (the dialog handles its own Esc); and a bare Enter, Space, or arrow
 * on a focused control belongs to that control.
 *
 * @param registered - Commands in registration order, oldest first.
 * @param keysOf - A command's bindings, after user overrides.
 * @param step - The press in binding notation (see `eventToStep`).
 * @param prefix - The chord's first step, from {@link chordPrefix}.
 * @returns The command to run, if any; when there is none, whether `step`
 *   starts a chord and should be kept as the next press's prefix.
 */
export function matchCommand<C extends { priority?: number }>(
  registered: ReadonlyArray<C>,
  keysOf: (command: C) => ReadonlyArray<string>,
  step: string,
  prefix: string | undefined,
  context: KeyContext,
): { match: C | undefined; startsChord: boolean } {
  const allowed = (binding: string) =>
    context.modal ? hasModifier(binding) && binding !== "escape" : hasModifier(binding) || (!context.typing && !(context.control && CONTROL_KEYS.has(binding)));
  // Most recently registered first; a stable sort then puts higher priority ahead.
  const all = [...registered].reverse().sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  const chord = prefix === undefined ? undefined : `${prefix} ${step}`;
  const match =
    (chord === undefined ? undefined : all.find((c) => keysOf(c).includes(chord))) ??
    all.find((c) => keysOf(c).includes(step) && allowed(step));
  const startsChord = match === undefined && !context.typing && !context.modal && all.some((c) => keysOf(c).some((k) => k.startsWith(`${step} `)));
  return { match, startsChord };
}
