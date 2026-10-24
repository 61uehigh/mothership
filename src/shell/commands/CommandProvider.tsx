"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { eventToStep, hasModifier } from "@/shell/commands/keys";

const CHORD_TIMEOUT_MS = 1000;

/**
 * ### Command
 *
 * One user action. Buttons, the palette, and shortcuts all invoke the same
 * `run`, so registering a command makes it reachable everywhere.
 */
export type Command = {
  /** Unique id; a later registration with the same id replaces the earlier one. */
  id: string;
  title: string;
  /** Heading in the palette and help overlay. */
  group: string;
  /** Bindings in `keys.ts` notation. */
  keys: Array<string>;
  /** Return `false` when there was nothing to do, so the key keeps its default behaviour. */
  run: () => void | boolean;
  /** Hide from the palette (still reachable by shortcut). */
  hidden?: boolean;
  /** Also offer it in plain ⌘P search, not only after `>` (e.g. "Open Terminal"). */
  featured?: boolean;
  /**
   * When several commands share a key, the highest priority wins, then the
   * most recently registered. Use it for views nested in a page (e.g. a
   * review panel's `j` over the page's `j`), since React registers children
   * before their parents.
   *
   * @defaultValue 0
   */
  priority?: number;
};

type Registry = {
  register: (commands: Array<Command>) => () => void;
  list: () => Array<Command>;
  /** Bumps whenever the registry changes, so lists can re-render. */
  version: number;
  /** The command's keys after user overrides from config/keybindings.yaml. */
  keysFor: (command: Command) => Array<string>;
  /** Saves an override; `undefined` restores the default. */
  setBinding: (id: string, keys: Array<string> | undefined) => Promise<void>;
  /** Suspends all shortcuts, e.g. while recording a new one. */
  setSuspended: (suspended: boolean) => void;
};

const CommandContext = createContext<Registry | undefined>(undefined);

function modalOpen(): boolean {
  // `<Modal>` is a native modal `<dialog>`; `aria-modal` covers any other dialog.
  return document.querySelector(':modal, [aria-modal="true"]') !== null;
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/** Keys a focused control uses itself: Enter and Space press it, arrows move within it. */
const CONTROL_KEYS = new Set(["enter", "space", "up", "down", "left", "right", "home", "end"]);

/** Whether the focused element is a control that answers {@link CONTROL_KEYS} (a button, link, tab, slider, …). */
function isControl(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (["BUTTON", "A", "SUMMARY"].includes(target.tagName)) return true;
  return ["button", "link", "tab", "radio", "checkbox", "switch", "option", "menuitem", "slider", "separator", "treeitem"].includes(target.getAttribute("role") ?? "");
}

/**
 * ### CommandProvider
 *
 * Holds the command registry and the single global key listener. Single-key
 * shortcuts are ignored while a text field is focused or an IME composition
 * is in progress; `mod`/`alt` bindings and Esc always work.
 */
export function CommandProvider({ children }: { children: ReactNode }) {
  const commands = useRef(new Map<string, Command>());
  const [version, setVersion] = useState(0);
  const pending = useRef<{ step: string; at: number } | undefined>(undefined);
  const [overrides, setOverrides] = useState<Record<string, Array<string>>>({});
  const overridesRef = useRef(overrides);
  const suspended = useRef(false);

  useEffect(() => {
    overridesRef.current = overrides;
  }, [overrides]);

  useEffect(() => {
    void fetch("/api/keybindings")
      // Trusted: produced by our own /api/keybindings route.
      .then((r) => r.json() as Promise<{ overrides: Record<string, Array<string>> }>)
      .then((data) => setOverrides(data.overrides))
      // Shortcuts still work with their defaults; only custom ones are missing.
      .catch((error: unknown) => console.error("[mothership] could not load keybindings", error));
  }, []);

  useEffect(() => {
    const keysOf = (command: Command) => overridesRef.current[command.id] ?? command.keys;
    function onKeyDown(event: KeyboardEvent) {
      // A component already handled this key (e.g. a list moving its selection).
      if (suspended.current || event.isComposing || event.repeat || event.defaultPrevented) return;
      const step = eventToStep(event);
      if (step === undefined) return;
      const typing = isTyping(event.target);
      const control = isControl(event.target);
      const modal = modalOpen();
      // In a dialog only mod/alt shortcuts pass; the dialog handles its own Esc. A bare Enter,
      // Space, or arrow on a focused button or tab belongs to that control, not to a shortcut.
      const allowed = (binding: string) =>
        modal ? hasModifier(binding) && binding !== "escape" : hasModifier(binding) || (!typing && !(control && CONTROL_KEYS.has(binding)));
      const now = Date.now();
      const prefix = pending.current !== undefined && now - pending.current.at < CHORD_TIMEOUT_MS ? pending.current.step : undefined;
      pending.current = undefined;

      // Most recently registered first; a stable sort then puts higher priority ahead.
      const all = [...commands.current.values()].reverse().sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
      const chord = prefix === undefined ? undefined : `${prefix} ${step}`;
      const match =
        (chord === undefined ? undefined : all.find((c) => keysOf(c).includes(chord))) ??
        all.find((c) => keysOf(c).includes(step) && allowed(step));
      if (match !== undefined) {
        if (match.run() !== false) event.preventDefault();
        return;
      }
      if (!typing && !modal && all.some((c) => keysOf(c).some((k) => k.startsWith(`${step} `)))) {
        pending.current = { step, at: now };
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Stable identity: `useCommands` lists `register` as an effect dependency.
  const register = useCallback((list: Array<Command>) => {
    for (const command of list) commands.current.set(command.id, command);
    setVersion((v) => v + 1);
    return () => {
      for (const command of list) {
        if (commands.current.get(command.id) === command) commands.current.delete(command.id);
      }
      setVersion((v) => v + 1);
    };
  }, []);
  const registry = useMemo<Registry>(
    () => ({
      register,
      list: () => [...commands.current.values()],
      version,
      keysFor: (command) => overrides[command.id] ?? command.keys,
      setBinding: async (id, keys) => {
        const response = await fetch("/api/keybindings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          // The route takes `null` for "restore the default".
          body: JSON.stringify({ id, keys: keys ?? null }),
        });
        // Trusted: produced by our own /api/keybindings route.
        if (response.ok) setOverrides(((await response.json()) as { overrides: Record<string, Array<string>> }).overrides);
      },
      setSuspended: (value) => {
        suspended.current = value;
      },
    }),
    [register, version, overrides],
  );

  return <CommandContext.Provider value={registry}>{children}</CommandContext.Provider>;
}

function useRegistry(): Registry {
  const registry = useContext(CommandContext);
  if (registry === undefined) throw new Error("useCommands must be used inside CommandProvider");
  return registry;
}

/**
 * ### useCommands
 *
 * Registers commands while the calling component is mounted. Pass a memoised
 * array; a new array identity re-registers.
 */
export function useCommands(commands: Array<Command>): void {
  const { register } = useRegistry();
  useEffect(() => register(commands), [register, commands]);
}

/**
 * ### useCommandList
 *
 * @returns Every registered command with user overrides applied to `keys`,
 *   re-rendering when registrations or overrides change.
 */
export function useCommandList(): Array<Command> {
  const registry = useRegistry();
  return registry.list().map((c) => ({ ...c, keys: registry.keysFor(c) }));
}

/**
 * ### useKeybindingEditor
 *
 * @returns Functions for the shortcut settings UI.
 */
export function useKeybindingEditor(): Pick<Registry, "setBinding" | "setSuspended"> & {
  isOverridden: (id: string) => boolean;
  defaultKeys: (id: string) => Array<string>;
} {
  const registry = useRegistry();
  const all = registry.list();
  return {
    setBinding: registry.setBinding,
    setSuspended: registry.setSuspended,
    isOverridden: (id) => {
      const command = all.find((c) => c.id === id);
      return command !== undefined && registry.keysFor(command) !== command.keys;
    },
    defaultKeys: (id) => all.find((c) => c.id === id)?.keys ?? [],
  };
}
