/**
 * Key binding notation: steps separated by spaces (`"g h"` is a chord), each
 * step is `+`-joined modifiers then one key: `"mod+k"`, `"shift+/"`, `"j"`.
 * `mod` is ⌘ on macOS and Ctrl elsewhere.
 */

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
 * mothership runs on the Mac it is used from, so server rendering assumes a
 * Mac (`true`): that keeps the first client render of key labels identical
 * on the Mac. Other devices (a phone browsing it) relabel after hydration,
 * with a recoverable hydration warning.
 *
 * @returns Whether `mod` means ⌘.
 */
export function isMac(): boolean {
  if (typeof window === "undefined") return true;
  return /Mac|iPhone|iPad/.test(navigator.userAgent);
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
 * @returns Human-readable form, e.g. `"⌘K"`, `"Ctrl+K"`, `"G then H"`.
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
