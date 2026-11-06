/**
 * Key binding notation: steps separated by spaces (`"g h"` is a chord), each
 * step is `+`-joined modifiers then one key: `"mod+k"`, `"shift+/"`, `"j"`.
 * `mod` is ⌘ on macOS and Ctrl elsewhere.
 */

import { hostPlatform } from "@/ui/hostPlatform";

const CODE_TO_KEY: Record<string, string> = {
  Slash: "/",
  Period: ".",
  Comma: ",",
  BracketLeft: "[",
  BracketRight: "]",
  Enter: "enter",
  NumpadEnter: "enter",
  Escape: "escape",
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  Backspace: "backspace",
  Space: "space",
};

const KEY_FALLBACK: Record<string, string> = {
  "?": "/",
  "/": "/",
  ".": ".",
  ",": ",",
  "[": "[",
  "]": "]",
  Enter: "enter",
  Escape: "escape",
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

const DISPLAY: Record<string, string> = {
  enter: "↵",
  escape: "Esc",
  up: "↑",
  down: "↓",
  left: "←",
  right: "→",
  space: "Space",
  backspace: "⌫",
};

/**
 * ### isMac
 *
 * Decided by {@link hostPlatform}, which the server renders into `<html>`,
 * so key labels in server rendering and the first browser render agree on
 * a Mac and on Windows.
 *
 * @returns Whether `mod` means ⌘.
 */
export function isMac(): boolean {
  return hostPlatform() === "darwin";
}

/**
 * ### eventToStep
 *
 * Reads the physical key (`KeyboardEvent.code`), not the produced character,
 * so bindings work the same with a Korean or any other layout active.
 *
 * @returns The step in binding notation, or `undefined` for a bare modifier
 *   press or a key with no binding name.
 */
export function eventToStep(event: KeyboardEvent): string | undefined {
  const { code } = event;
  let key: string | undefined;
  if (code.startsWith("Key")) key = code.slice(3).toLowerCase();
  else if (code.startsWith("Digit")) key = code.slice(5);
  else if (code !== "" && code !== "Unidentified") key = CODE_TO_KEY[code];
  // Some virtual keyboards and automation send no `code`; fall back to the
  // character, mapping shifted symbols back to their base key.
  else key = KEY_FALLBACK[event.key] ?? (/^[a-z0-9]$/i.test(event.key) ? event.key.toLowerCase() : undefined);
  if (key === undefined) return undefined;

  const mac = isMac();
  const mods = [
    (mac ? event.metaKey : event.ctrlKey) && "mod",
    event.altKey && "alt",
    event.shiftKey && "shift",
  ].filter((m): m is string => typeof m === "string");
  return [...mods, key].join("+");
}

/**
 * ### hasModifier
 *
 * @returns Whether the binding's first step uses `mod` or `alt`; such bindings
 *   stay active while typing in a text field.
 */
export function hasModifier(binding: string): boolean {
  const first = binding.split(" ")[0];
  return first.includes("mod+") || first.includes("alt+") || first === "escape";
}

/**
 * ### formatBinding
 *
 * @returns Human-readable form, e.g. `"⌘K"`, `"Ctrl+K"`, `"G → H"`.
 */
export function formatBinding(binding: string): string {
  const mac = isMac();
  return binding
    .split(" ")
    .map((step) =>
      step
        .split("+")
        .map((part) => {
          if (part === "mod") return mac ? "⌘" : "Ctrl";
          if (part === "shift") return mac ? "⇧" : "Shift";
          if (part === "alt") return mac ? "⌥" : "Alt";
          return DISPLAY[part] ?? part.toUpperCase();
        })
        .join(mac ? "" : "+"),
    )
    .join(" → ");
}

/**
 * ### readKeyOverridesResponse
 *
 * Reads `/api/keybindings`' `{ overrides }` answer. Checked rather than
 * trusted: overrides that are not an object of key lists would make every
 * keydown throw, and with it every shortcut stop working.
 *
 * @returns Command id → keys, or `undefined` when the answer has another shape.
 */
export function readKeyOverridesResponse(body: unknown): Record<string, Array<string>> | undefined {
  if (typeof body !== "object" || body === null || !("overrides" in body)) return undefined;
  const { overrides } = body;
  if (typeof overrides !== "object" || overrides === null || Array.isArray(overrides)) return undefined;
  const entries = Object.entries(overrides);
  const valid = entries.every(([, keys]) => Array.isArray(keys) && keys.every((key) => typeof key === "string"));
  return valid ? (Object.fromEntries(entries) as Record<string, Array<string>>) : undefined;
}
