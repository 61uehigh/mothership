"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import type { SecretState } from "@/features/settings/model/Settings";

const BUTTON = "rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800";

/**
 * ### SecretField
 *
 * One `.env.local` value. A saved value is never shown or sent back; you can
 * only replace or remove it.
 *
 * @param kind - `path` shows what you type; `token` hides it.
 * @param onSave - Saves the value (empty removes it); resolves to an error message, or `undefined` when saved.
 */
export function SecretField({
  secret,
  label,
  placeholder,
  kind,
  onSave,
}: {
  secret: SecretState;
  label: string;
  placeholder: string;
  kind: "token" | "path";
  onSave: (value: string) => Promise<string | undefined>;
}) {
  const [editing, setEditing] = useState(false);
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
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs text-zinc-600 dark:text-zinc-400">
        {label} <span className="font-mono text-[11px] text-zinc-500">{secret.name}</span>
      </label>
      {secret.set && !editing ? (
        <div className="flex items-center gap-2 text-xs">
          <span className="flex items-center gap-1 text-green-700 dark:text-green-400">
            <Check size={13} aria-hidden /> Saved
          </span>
          <button type="button" className={BUTTON} disabled={busy} onClick={() => setEditing(true)}>
            Replace
          </button>
          {confirmRemove ? (
            <>
              <button type="button" className={`${BUTTON} border-red-300 text-red-700 dark:border-red-900 dark:text-red-400`} disabled={busy} onClick={() => void save("")}>
                Remove it
              </button>
              <button type="button" className={BUTTON} disabled={busy} onClick={() => setConfirmRemove(false)}>
                Keep
              </button>
            </>
          ) : (
            <button type="button" className={BUTTON} disabled={busy} onClick={() => setConfirmRemove(true)}>
              Remove
            </button>
          )}
        </div>
      ) : (
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (value.trim() !== "") void save(value);
          }}
        >
          <input
            id={id}
            type={kind === "token" ? "password" : "text"}
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-transparent px-2.5 py-1 font-mono text-xs dark:border-zinc-700"
            placeholder={placeholder}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <button type="submit" className={BUTTON} disabled={busy || value.trim() === ""}>
            Save
          </button>
          {secret.set && (
            <button type="button" className={BUTTON} disabled={busy} onClick={() => setEditing(false)}>
              Cancel
            </button>
          )}
        </form>
      )}
      {error !== undefined && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
