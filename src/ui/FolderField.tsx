"use client";

import { Folder, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { useT } from "@/ui/i18n/useT";
import { fetchJson, jsonRequest } from "@/ui/useJson";

/**
 * ### FolderField
 *
 * A folder path input with a folder button at its right end that opens the
 * system folder picker, starting at the folder typed so far.
 */
export function FolderField({
  value,
  onChange,
  onError,
  className,
  placeholder,
  list,
}: {
  value: string;
  onChange: (folder: string) => void;
  /** A failure to show the picker, or `undefined` when a pick starts. */
  onError: (message: string | undefined) => void;
  /** The input's classes (border, padding, font). */
  className: string;
  placeholder?: string;
  /** The id of a `<datalist>` of suggestions. */
  list?: string;
}) {
  const t = useT();
  const [picking, setPicking] = useState(false);

  async function pick() {
    setPicking(true);
    onError(undefined);
    const result = await fetchJson<{ folder: string | null }>("/api/pick-folder", jsonRequest("POST", { start: value, prompt: t("ui.chooseFolder") }));
    setPicking(false);
    if (!result.ok) onError(result.error);
    else if (result.data.folder !== null) onChange(result.data.folder);
  }

  return (
    <div className="relative">
      <input className={`${className} pr-9`} placeholder={placeholder} list={list} value={value} onChange={(e) => onChange(e.target.value)} />
      <button
        type="button"
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-md text-zinc-500 hover:text-zinc-900 disabled:opacity-60 dark:hover:text-zinc-100"
        aria-label={t("ui.chooseFolder")}
        title={t("ui.chooseFolder")}
        disabled={picking}
        onClick={() => void pick()}
      >
        {picking ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Folder className="size-4" aria-hidden />}
      </button>
    </div>
  );
}
