"use client";

import { FileUp, LoaderCircle } from "lucide-react";
import { useRef } from "react";
import { SETTINGS_BUTTON, SETTINGS_PRIMARY_BUTTON } from "@/features/settings/ui/settingsLayout";

/**
 * ### ChooseClientFile
 *
 * The button that picks a downloaded Google OAuth client file (the card
 * also takes it dropped anywhere on it, through `useFileDrop`).
 *
 * @param onFile - Reads and sends the chosen file.
 */
export function ChooseClientFile({ busy, primary, onFile }: { busy: boolean; primary: boolean; onFile: (file: File | undefined) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={input} type="file" accept=".json,application/json" className="hidden" onChange={(event) => onFile(event.target.files?.[0])} />
      <button type="button" className={primary ? SETTINGS_PRIMARY_BUTTON : SETTINGS_BUTTON} disabled={busy} onClick={() => input.current?.click()}>
        {busy ? <LoaderCircle size={13} className="animate-spin" aria-hidden /> : <FileUp size={13} aria-hidden />}
        Choose file…
      </button>
    </>
  );
}

/**
 * ### SavedClientFile
 *
 * A saved OAuth client file under Details: never shown, only replaced or removed.
 *
 * @param project - The client's Google Cloud project, when known.
 */
export function SavedClientFile({ project, busy, onReplace, onRemove }: { project?: string; busy: boolean; onReplace: () => void; onRemove: () => void }) {
  return (
    <>
      <span>Saved (hidden){project === undefined ? "" : ` · ${project}`}</span>
      <button type="button" className={SETTINGS_BUTTON} disabled={busy} onClick={onReplace}>
        Replace
      </button>
      <button type="button" className={SETTINGS_BUTTON} disabled={busy} onClick={onRemove}>
        Remove
      </button>
    </>
  );
}
