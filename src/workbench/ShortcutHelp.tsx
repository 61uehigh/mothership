"use client";

import { useEffect, useRef, useState } from "react";
import { useCommandList, useKeybindingEditor, type Command } from "@/shell/commands/commandContext";
import { eventToStep, formatBinding } from "@/shell/commands/keys";
import { commandGroupLabel } from "@/shell/commands/commandGroups";
import { useT } from "@/ui/i18n/useT";
import { Modal } from "@/ui/Modal";
import { reportFailure } from "@/ui/notices";

const CHORD_WINDOW_MS = 900;

type Recording = { id: string; steps: Array<string>; done: boolean };

function conflicts(binding: string, self: Command, commands: Array<Command>): Array<Command> {
  return commands.filter(
    (c) =>
      c.id !== self.id &&
      c.keys.some((k) => k === binding || k.startsWith(`${binding} `) || binding.startsWith(`${k} `)),
  );
}

/**
 * ### ShortcutHelp
 *
 * Every command on the current page that has a shortcut, grouped, and the
 * place to change them: click a shortcut, press the new keys (two in a row
 * for a chord), and save. Overrides go to `config/keybindings.yaml`.
 */
export function ShortcutHelp({ onClose }: { onClose: () => void }) {
  const commands = useCommandList().filter((c) => c.keys.length > 0 || !c.hidden);
  const editor = useKeybindingEditor();
  const t = useT();
  const [recording, setRecording] = useState<Recording | undefined>(undefined);
  const groups = [...new Set(commands.map((c) => c.group))];
  const listening = recording !== undefined && !recording.done;
  // The editor object changes identity on every render; the effect only needs its latest suspend switch.
  const setSuspended = useRef(editor.setSuspended);
  useEffect(() => {
    setSuspended.current = editor.setSuspended;
  });

  // Runs once per recording session, so the chord timer survives the re-render each key press causes.
  useEffect(() => {
    if (!listening) return;
    setSuspended.current(true);
    let timer: ReturnType<typeof setTimeout> | undefined;
    function onKeyDown(event: KeyboardEvent) {
      // Capture phase: keep the key from reaching the dialog's own Esc handling.
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        setRecording(undefined);
        return;
      }
      const step = eventToStep(event);
      if (step === undefined) return;
      clearTimeout(timer);
      setRecording((r) => {
        if (r === undefined) return r;
        const steps = [...r.steps, step];
        return { ...r, steps, done: steps.length >= 2 };
      });
      timer = setTimeout(() => setRecording((r) => (r === undefined ? r : { ...r, done: true })), CHORD_WINDOW_MS);
    }
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      setSuspended.current(false);
    };
  }, [listening]);

  /** `undefined` restores the default. */
  async function save(id: string, keys: Array<string> | undefined) {
    const result = await editor.setBinding(id, keys);
    setRecording(undefined);
    reportFailure(t("shortcuts.saveFailed"), result);
  }

  return (
    <Modal
      label={t("shortcuts.title")}
      className="items-center justify-center p-4 backdrop:bg-black/40"
      onClose={() => {
        // While recording, Esc cancels the recording instead.
        if (recording === undefined) onClose();
      }}
    >
      <div className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-5 shadow-2xl dark:bg-zinc-900">
        <div className="mb-2 flex items-center">
          <h2 className="font-semibold">{t("shortcuts.title")}</h2>
          <button type="button" data-autofocus onClick={onClose} className="ml-auto rounded px-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">
            ✕
          </button>
        </div>
        <p className="mb-4 text-xs text-zinc-500">{t("shortcuts.intro", { mod: formatBinding("mod") })}</p>
        {groups.map((group) => (
          <section key={group} className="mb-4">
            <h3 className="mb-1 text-xs font-medium text-zinc-500">{commandGroupLabel(t, group)}</h3>
            {commands
              .filter((c) => c.group === group)
              .map((c) => {
                const active = recording?.id === c.id ? recording : undefined;
                const binding = active?.steps.join(" ");
                const clash = binding === undefined || binding === "" ? [] : conflicts(binding, c, commands);
                return (
                  <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-1 text-sm">
                    <span className="min-w-0 flex-1">
                      {c.title}
                      {editor.isOverridden(c.id) && <span className="ml-1 text-[10px] text-teal-600">{t("shortcuts.changed")}</span>}
                    </span>
                    {active === undefined ? (
                      <span className="flex items-center gap-1">
                        <button
                          type="button"
                          title={t("shortcuts.clickToChange")}
                          className="flex gap-1 rounded px-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                          onClick={() => setRecording({ id: c.id, steps: [], done: false })}
                        >
                          {c.keys.length === 0 ? (
                            <span className="text-[11px] text-zinc-400">{t("shortcuts.none")}</span>
                          ) : (
                            c.keys.map((k) => (
                              <kbd key={k} className="rounded border border-zinc-300 px-1.5 font-mono text-[11px] dark:border-zinc-700">
                                {formatBinding(k)}
                              </kbd>
                            ))
                          )}
                        </button>
                        {editor.isOverridden(c.id) && (
                          <button type="button" className="text-[11px] text-zinc-500 hover:underline" onClick={() => void save(c.id, undefined)}>
                            {t("shortcuts.default")}
                          </button>
                        )}
                      </span>
                    ) : (
                      <span className="flex flex-col items-end gap-1">
                        <span className="flex items-center gap-2">
                          <kbd className="rounded border border-teal-500 px-1.5 font-mono text-[11px]">
                            {binding === "" ? t("shortcuts.pressKey") : formatBinding(binding ?? "")}
                          </kbd>
                          {active.done && binding !== "" && (
                            <button type="button" className="text-[11px] text-teal-700 hover:underline dark:text-teal-300" onClick={() => void save(c.id, [binding ?? ""])}>
                              {t("shortcuts.save")}
                            </button>
                          )}
                          <button type="button" className="text-[11px] text-zinc-500 hover:underline" onClick={() => void save(c.id, [])}>
                            {t("shortcuts.disable")}
                          </button>
                          <button type="button" className="text-[11px] text-zinc-500 hover:underline" onClick={() => setRecording(undefined)}>
                            {t("ui.cancel")}
                          </button>
                        </span>
                        {clash.length > 0 && (
                          <span className="text-[11px] text-amber-600">{t("shortcuts.conflicts", { titles: clash.map((x) => x.title).join(", ") })}</span>
                        )}
                      </span>
                    )}
                  </div>
                );
              })}
          </section>
        ))}
        <p className="text-[11px] text-zinc-500">{t("shortcuts.savedTo")}</p>
      </div>
    </Modal>
  );
}
