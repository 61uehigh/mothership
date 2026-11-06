"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { useDeveloperMode } from "@/features/settings/ui/developerMode";
import { SETTINGS_PRIMARY_BUTTON } from "@/features/settings/ui/settingsLayout";
import { SECRET_VALUE_MAX, type SecretState } from "@/features/settings/model/Settings";
import { useT } from "@/ui/i18n/useT";

const BUTTON = "rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800";

/**
 * ### SecretField
 *
 * One `.env.local` value. A saved value is never shown or sent back; you can
 * only replace or remove it.
 *
 * @param onSave - Saves the value (empty removes it); resolves to an error message, or `undefined` when saved.
 * @param startEditing - Opens with the field for a new value, e.g. after the saved one was refused.
 * @param bare - Leaves out the visible label, for a field that sits in a setup step or a Details row
 *   that already names it; the label and variable name stay for screen readers and the tooltip.
 */
export function SecretField({
  secret,
  label,
  placeholder,
  onSave,
  bare = false,
  startEditing = false,
  onCancel,
}: {
  secret: SecretState;
  label: string;
  placeholder: string;
  onSave: (value: string) => Promise<string | undefined>;
  bare?: boolean;
  startEditing?: boolean;
  /** Called when you cancel replacing a saved value. */
  onCancel?: () => void;
}) {
  const t = useT();
  const [editing, setEditing] = useState(startEditing);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  async function save(next: string) {
    setBusy(true);
    const failure = await onSave(next);
    setBusy(false);
    setError(failure);
    if (failure !== undefined) return;
    setValue("");
    setEditing(false);
    setConfirmRemove(false);
  }

  const id = `secret-${secret.name}`;
  const developer = useDeveloperMode();
  return (
    <div className={`flex flex-col gap-1 ${bare && !secret.set ? "min-w-0 flex-1" : ""}`}>
      {!bare && (
        <label htmlFor={id} className="text-xs text-zinc-600 dark:text-zinc-400">
          {label} {developer && <span className="font-mono text-[11px] text-zinc-500">{secret.name}</span>}
        </label>
      )}
      {secret.set && !editing ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="flex items-center gap-1 text-green-700 dark:text-green-400">
            <Check size={13} aria-hidden /> {t("settings.saved")} <span className="text-zinc-500">{t("settings.hidden")}</span>
          </span>
          <button type="button" className={BUTTON} disabled={busy} onClick={() => setEditing(true)}>
            {t("settings.replace")}
          </button>
          {confirmRemove ? (
            <>
              <button type="button" className={`${BUTTON} border-red-300 text-red-700 dark:border-red-900 dark:text-red-400`} disabled={busy} onClick={() => void save("")}>
                {t("settings.secret.removeIt")}
              </button>
              <button type="button" className={BUTTON} disabled={busy} onClick={() => setConfirmRemove(false)}>
                {t("settings.keep")}
              </button>
            </>
          ) : (
            <button type="button" className={BUTTON} disabled={busy} onClick={() => setConfirmRemove(true)}>
              {t("settings.remove")}
            </button>
          )}
        </div>
      ) : (
        <form
          className="flex min-w-0 items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (value.trim() !== "") void save(value);
          }}
        >
          <input
            id={id}
            aria-label={bare ? label : undefined}
            title={bare && developer ? t("settings.secret.savedAs", { label, name: secret.name }) : undefined}
            type="password"
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-transparent px-2.5 py-1 font-mono text-xs dark:border-zinc-700"
            placeholder={placeholder}
            value={value}
            maxLength={SECRET_VALUE_MAX}
            onChange={(e) => setValue(e.target.value)}
          />
          <button type="submit" className={SETTINGS_PRIMARY_BUTTON} disabled={busy || value.trim() === ""}>
            {t("settings.save")}
          </button>
          {secret.set && (
            <button
              type="button"
              className={BUTTON}
              disabled={busy}
              onClick={() => {
                setEditing(false);
                onCancel?.();
              }}
            >
              {t("ui.cancel")}
            </button>
          )}
        </form>
      )}
      {error !== undefined && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
