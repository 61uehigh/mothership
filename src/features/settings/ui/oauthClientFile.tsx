"use client";

import { FileUp, LoaderCircle } from "lucide-react";
import { useRef } from "react";
import { OAUTH_CLIENT_MAX_BYTES } from "@/features/settings/model/Settings";
import { SETTINGS_BUTTON, SETTINGS_PRIMARY_BUTTON } from "@/features/settings/ui/settingsLayout";
import { useT } from "@/ui/i18n/useT";

/**
 * ### OAUTH_CLIENT_TOO_LARGE
 *
 * The message key shown before uploading a file larger than any OAuth client file.
 */
export const OAUTH_CLIENT_TOO_LARGE = "settings.oauth.tooLarge";

/**
 * ### isOAuthClientTooLarge
 *
 * Checked in the browser so a wrong file is refused before it is sent; the server checks again.
 */
export function isOAuthClientTooLarge(file: File): boolean {
  return file.size > OAUTH_CLIENT_MAX_BYTES;
}

/**
 * ### ChooseClientFile
 *
 * The button that picks a downloaded Google OAuth client file (the card
 * also takes it dropped anywhere on it, through `useFileDrop`).
 *
 * @param onFile - Reads and sends the chosen file.
 */
export function ChooseClientFile({ busy, primary, onFile }: { busy: boolean; primary: boolean; onFile: (file: File | undefined) => void }) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={input} type="file" accept=".json,application/json" className="hidden" onChange={(event) => onFile(event.target.files?.[0])} />
      <button type="button" className={primary ? SETTINGS_PRIMARY_BUTTON : SETTINGS_BUTTON} disabled={busy} onClick={() => input.current?.click()}>
        {busy ? <LoaderCircle size={13} className="animate-spin" aria-hidden /> : <FileUp size={13} aria-hidden />}
        {t("settings.oauth.chooseFile")}
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
  const t = useT();
  return (
    <>
      <span>
        {t("settings.savedHidden")}
        {project === undefined ? "" : ` · ${project}`}
      </span>
      <button type="button" className={SETTINGS_BUTTON} disabled={busy} onClick={onReplace}>
        {t("settings.replace")}
      </button>
      <button type="button" className={SETTINGS_BUTTON} disabled={busy} onClick={onRemove}>
        {t("settings.remove")}
      </button>
    </>
  );
}
