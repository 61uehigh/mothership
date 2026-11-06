"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { CommandGroup } from "@/shell/commands/commandGroups";
import { eventToStep, readKeyOverridesResponse } from "@/shell/commands/keys";
import { chordPrefix, matchCommand } from "@/shell/commands/matchCommand";
import { recordCommand } from "@/shell/usage";
import { fetchJson, jsonRequest, type ApiResult } from "@/ui/useJson";

/** What `/api/keybindings` answers: command id → keys. */
type KeyOverrides = { overrides: Record<string, Array<string>> };

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
  group: CommandGroup;
  /** Bindings in `keys.ts` notation. */
  keys: Array<string>;
  /** Return `false` when there was nothing to do, so the key keeps its default behaviour. */
  run: () => void | boolean;
  /** Hide from the palette (still reachable by shortcut). */
  hidden?: boolean;
  /** Also offer it in plain quick-open search (mod+p), not only after `>` (e.g. "Open Terminal"). */
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
  /** Saves an override; `undefined` restores the default. Failures (an invalid binding, the network) come back as a value. */
  setBinding: (id: string, keys: Array<string> | undefined) => Promise<ApiResult<KeyOverrides>>;
  /** Suspends all shortcuts, e.g. while recording a new one. */
  setSuspended: (suspended: boolean) => void;
};

const CommandContext = createContext<Registry | undefined>(undefined);
const RegisterContext = createContext<Registry["register"] | undefined>(undefined);

function modalOpen(): boolean {
  // `<Modal>` is a native modal `<dialog>`; `aria-modal` covers any other dialog.
  return document.querySelector(':modal, [aria-modal="true"]') !== null;
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/** Whether the focused element is a control that answers Enter, Space, or arrows itself (a button, link, tab, slider, …). */
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
    void fetchJson<unknown>("/api/keybindings").then((result) => {
      // On failure shortcuts keep their defaults; only custom ones are missing.
      const overrides = result.ok ? readKeyOverridesResponse(result.data) : undefined;
      if (overrides === undefined) console.error("[mothership] could not load keybindings", result.ok ? "unexpected answer" : result.error);
      else setOverrides(overrides);
    });
  }, []);

  useEffect(() => {
    const keysOf = (command: Command) => overridesRef.current[command.id] ?? command.keys;
    function onKeyDown(event: KeyboardEvent) {
      // A component already handled this key (e.g. a list moving its selection).
      if (suspended.current || event.isComposing || event.repeat || event.defaultPrevented) return;
      const step = eventToStep(event);
      if (step === undefined) return;
      const now = Date.now();
      const prefix = chordPrefix(pending.current, now);
      pending.current = undefined;
      const { match, startsChord } = matchCommand([...commands.current.values()], keysOf, step, prefix, {
        typing: isTyping(event.target),
        control: isControl(event.target),
        modal: modalOpen(),
      });
      if (match !== undefined) {
        recordCommand(match.id, "shortcut");
        if (match.run() !== false) event.preventDefault();
        return;
      }
      if (startsChord) pending.current = { step, at: now };
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
        // The route takes `null` for "restore the default".
        const result = await fetchJson<KeyOverrides>("/api/keybindings", jsonRequest("PUT", { id, keys: keys ?? null }));
        if (result.ok) setOverrides(result.data.overrides);
        return result;
      },
      setSuspended: (value) => {
        suspended.current = value;
      },
    }),
    [register, version, overrides],
  );

  return (
    <RegisterContext.Provider value={register}>
      <CommandContext.Provider value={registry}>{children}</CommandContext.Provider>
    </RegisterContext.Provider>
  );
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
  // Only the stable `register`: reading the registry would re-render every registrant on each registration.
  const register = useContext(RegisterContext);
  if (register === undefined) throw new Error("useCommands must be used inside CommandProvider");
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
  // Memoised so callers' own memos (the palette's fuzzy-matched rows) hold between keystrokes.
  return useMemo(() => registry.list().map((c) => ({ ...c, keys: registry.keysFor(c) })), [registry]);
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
