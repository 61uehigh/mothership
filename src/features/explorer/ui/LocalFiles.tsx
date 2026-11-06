"use client";

import {
  ArrowUp,
  Code2,
  Eye,
  EyeOff,
  FileText,
  Folder,
  FolderGit2,
  FolderOpen,
  House,
  LoaderCircle,
  SquareTerminal,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { openPathIn } from "@/features/explorer/ui/openPath";
import { appName } from "@/ui/fileManager";
import { ICON_BUTTON, RefreshButton } from "@/ui/iconButtons";
import { useJson } from "@/ui/useJson";
import { useExplorerLocation } from "@/shell/explorerLocation";
import { PaneHeader } from "@/shell/PaneHeader";
import { useWorkbench } from "@/shell/workbenchContext";
import { LOCAL_ROOT } from "@/features/explorer/model/Files";
import type { DirectoryListing, FilesErrorCode } from "@/features/explorer/model/Files";
import { filesFailureText } from "@/features/explorer/ui/filesFailureText";
import { SELECTED_ROW, ROW_HOVER } from "@/ui/selection";
import { useT } from "@/ui/i18n/useT";
import { homeRelativePath } from "@/features/explorer/model/homeRelativePath";

/** Real folder names under home, so they stay as they are on disk. */
const FOLDERS = ["Desktop", "Documents", "Downloads"];

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

/**
 * ### LocalFiles
 *
 * The explorer's local mode: browse the home folder one folder at a time, like
 * Finder. Folders open in place; a click previews a file and a double click
 * pins its tab. Favorites jump to common folders and configured repositories.
 * Secret files (`.env`, keys, `.ssh`, …) are never listed.
 */
export function LocalFiles() {
  const t = useT();
  const workbench = useWorkbench();
  const [saved, setSaved] = useExplorerLocation();
  const [filter, setFilter] = useState("");
  const repositories = useJson<{ repositories: Array<string> }>("/api/repositories").data?.repositories ?? [];
  const { path: current, hidden } = saved;
  // The previous folder stays on screen while the next one loads; a failed load replaces it with the error.
  const folder = useJson<DirectoryListing, FilesErrorCode>(`/api/files/dir?${new URLSearchParams({ root: LOCAL_ROOT, path: current, hidden: hidden ? "1" : "0" })}`, {
    keepPrevious: true,
  });
  const error = folder.failure === undefined ? undefined : filesFailureText(t, folder.failure, current === "" ? "~" : `~/${current}`);
  const listing = error === undefined ? folder.data : undefined;

  // The listed folder minus its relative path is the home folder.
  const home = listing === undefined ? undefined : listing.path === "" ? listing.absolute : listing.absolute.slice(0, -(listing.path.length + 1));

  const query = filter.trim().toLowerCase();
  const entries = useMemo(
    () => (listing?.entries ?? []).filter((entry) => query === "" || entry.name.toLowerCase().includes(query)),
    [listing, query],
  );

  function go(path: string) {
    setFilter("");
    setSaved((s) => ({ ...s, path }));
  }

  const favorites: Array<{ label: string; path: string; icon: ReactNode }> = [
    { label: t("explorer.home"), path: "", icon: <House size={12} aria-hidden /> },
    ...FOLDERS.map((name) => ({ label: name, path: name, icon: <Folder size={12} aria-hidden /> })),
    ...repositories.flatMap((repo) => {
      const path = home === undefined ? undefined : homeRelativePath(repo, home);
      return path === undefined ? [] : [{ label: path.split("/").at(-1) ?? path, path, icon: <FolderGit2 size={12} aria-hidden /> }];
    }),
  ];

  const crumbs = current === "" ? [] : current.split("/");
  const shownPath = listing?.path === current ? listing.absolute : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PaneHeader title={t("section.files")}>
        <button
          type="button"
          aria-label={hidden ? t("explorer.hideHidden") : t("explorer.showHidden")}
          title={hidden ? t("explorer.hideHidden") : t("explorer.showHidden")}
          className={ICON_BUTTON}
          onClick={() => setSaved((s) => ({ ...s, hidden: !s.hidden }))}
        >
          {hidden ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
        <RefreshButton loading={folder.loading} onClick={folder.reload} />
      </PaneHeader>

      <div className="flex flex-wrap gap-1 px-2 pb-1.5">
        {favorites.map((fav) => (
          <button
            key={`${fav.label}:${fav.path}`}
            type="button"
            title={fav.path === "" ? "~" : `~/${fav.path}`}
            onClick={() => go(fav.path)}
            className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${
              current === fav.path
                ? "border-teal-500 text-teal-700 dark:text-teal-300"
                : "border-zinc-300 text-zinc-600 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-500"
            }`}
          >
            {fav.icon}
            {fav.label}
          </button>
        ))}
      </div>

      <div className="flex min-w-0 items-center gap-0.5 px-2 pb-1.5 text-xs" title={shownPath}>
        <button type="button" aria-label={t("explorer.up")} title={t("explorer.up")} disabled={current === ""} className={ICON_BUTTON} onClick={() => go(crumbs.slice(0, -1).join("/"))}>
          <ArrowUp size={13} />
        </button>
        <nav aria-label={t("explorer.folderPath")} className="flex min-w-0 flex-1 items-center overflow-hidden">
          <button type="button" className="shrink-0 rounded px-1 hover:bg-zinc-200 dark:hover:bg-zinc-800" onClick={() => go("")}>
            ~
          </button>
          {crumbs.map((part, i) => (
            <span key={crumbs.slice(0, i + 1).join("/")} className={`flex min-w-0 items-center ${i < crumbs.length - 1 ? "shrink" : "shrink-0"}`}>
              <span className="px-0.5 text-zinc-400">/</span>
              <button
                type="button"
                className={`truncate rounded px-1 hover:bg-zinc-200 dark:hover:bg-zinc-800 ${i === crumbs.length - 1 ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-500"}`}
                onClick={() => go(crumbs.slice(0, i + 1).join("/"))}
              >
                {part}
              </button>
            </span>
          ))}
        </nav>
        <button type="button" aria-label={t("explorer.openIn", { app: appName("finder") })} title={t("explorer.openIn", { app: appName("finder") })} className={ICON_BUTTON} onClick={() => openPathIn(LOCAL_ROOT, current, "finder", t)}>
          <FolderOpen size={13} />
        </button>
        <button type="button" aria-label={t("explorer.openIn", { app: appName("terminal") })} title={t("explorer.openIn", { app: appName("terminal") })} className={ICON_BUTTON} onClick={() => openPathIn(LOCAL_ROOT, current, "terminal", t)}>
          <SquareTerminal size={13} />
        </button>
        <button type="button" aria-label={t("explorer.openIn", { app: appName("vscode") })} title={t("explorer.openIn", { app: appName("vscode") })} className={ICON_BUTTON} onClick={() => openPathIn(LOCAL_ROOT, current, "vscode", t)}>
          <Code2 size={13} />
        </button>
      </div>

      <div className="px-2 pb-2">
        <input
          className="w-full rounded-md border border-zinc-300 bg-transparent px-2 py-1 text-xs dark:border-zinc-700"
          placeholder={t("explorer.filter")}
          aria-label={t("explorer.filter")}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-3">
        {listing === undefined && error === undefined && (
          <p className="flex items-center gap-2 px-2 py-4 text-xs text-zinc-500">
            <LoaderCircle size={12} className="animate-spin" aria-hidden />
            {t("explorer.loadingFolder")}
          </p>
        )}
        {error !== undefined && (
          <div className="px-2 py-4 text-xs">
            <p className="text-red-600 dark:text-red-400">{t("explorer.folderError", { error })}</p>
            <button type="button" className="mt-2 text-teal-700 underline dark:text-teal-400" onClick={() => go("")}>
              {t("explorer.backHome")}
            </button>
          </div>
        )}
        {error === undefined && listing !== undefined && entries.length === 0 && (
          <p className="px-2 py-4 text-xs text-zinc-500">{query === "" ? t("explorer.emptyFolder") : t("explorer.noMatch")}</p>
        )}
        {error === undefined && (
          <ul>
            {entries.map((entry) => {
              const selected = workbench.active?.tab.kind === "file" && workbench.active.tab.root === LOCAL_ROOT && workbench.active.tab.path === entry.path;
              return (
                <li key={entry.path}>
                  <button
                    type="button"
                    title={entry.size === undefined ? entry.name : `${entry.name} · ${formatSize(entry.size)}`}
                    onClick={() => (entry.kind === "dir" ? go(entry.path) : workbench.open({ kind: "file", root: LOCAL_ROOT, path: entry.path }, { preview: true }))}
                    onDoubleClick={() => {
                      if (entry.kind === "file") workbench.open({ kind: "file", root: LOCAL_ROOT, path: entry.path });
                    }}
                    className={`flex w-full items-center gap-1.5 rounded px-2 py-0.5 text-left text-[13px] ${
                      selected ? SELECTED_ROW : ROW_HOVER
                    }`}
                  >
                    {entry.kind === "dir" ? (
                      <Folder size={14} className="shrink-0 text-sky-600 dark:text-sky-400" aria-hidden />
                    ) : (
                      <FileText size={14} className="shrink-0 text-zinc-500" aria-hidden />
                    )}
                    <span className={`min-w-0 flex-1 truncate ${entry.name.startsWith(".") ? "text-zinc-500" : ""}`}>{entry.name}</span>
                    {entry.size !== undefined && <span className="shrink-0 text-[11px] text-zinc-500">{formatSize(entry.size)}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
