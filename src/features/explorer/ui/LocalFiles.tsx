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
import { ICON_BUTTON, RefreshButton } from "@/ui/IconButton";
import { useJson } from "@/ui/useJson";
import { useExplorerLocation } from "@/shell/explorerLocation";
import { PaneHeader } from "@/shell/PaneHeader";
import { useWorkbench } from "@/shell/WorkbenchContext";
import { LOCAL_ROOT } from "@/features/explorer/model/Files";
import type { DirectoryListing } from "@/features/explorer/model/Files";

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
 *
 */
export function LocalFiles() {
  const workbench = useWorkbench();
  const [saved, setSaved] = useExplorerLocation();
  const [filter, setFilter] = useState("");
  const repositories = useJson<{ repositories: Array<string> }>("/api/repositories").data?.repositories ?? [];
  const { path: current, hidden } = saved;
  // The previous folder stays on screen while the next one loads; a failed load replaces it with the error.
  const folder = useJson<DirectoryListing>(`/api/files/dir?${new URLSearchParams({ root: LOCAL_ROOT, path: current, hidden: hidden ? "1" : "0" })}`, {
    keepPrevious: true,
  });
  const error = folder.error;
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

  /** Home-relative path of an absolute folder, or `undefined` when it is outside home. */
  function relativeToHome(absolute: string): string | undefined {
    if (home === undefined) return undefined;
    if (absolute === home) return "";
    return absolute.startsWith(`${home}/`) ? absolute.slice(home.length + 1) : undefined;
  }

  const favorites: Array<{ label: string; path: string; icon: ReactNode }> = [
    { label: "Home", path: "", icon: <House size={12} aria-hidden /> },
    ...FOLDERS.map((name) => ({ label: name, path: name, icon: <Folder size={12} aria-hidden /> })),
    ...repositories.flatMap((repo) => {
      const path = relativeToHome(repo);
      return path === undefined ? [] : [{ label: path.split("/").at(-1) ?? path, path, icon: <FolderGit2 size={12} aria-hidden /> }];
    }),
  ];

  const crumbs = current === "" ? [] : current.split("/");
  const shownPath = listing?.path === current ? listing.absolute : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PaneHeader title="Explorer">
        <button
          type="button"
          aria-label={hidden ? "Hide hidden files" : "Show hidden files"}
          title={hidden ? "Hide hidden files" : "Show hidden files"}
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
        <button type="button" aria-label="Up one folder" title="Up one folder" disabled={current === ""} className={ICON_BUTTON} onClick={() => go(crumbs.slice(0, -1).join("/"))}>
          <ArrowUp size={13} />
        </button>
        <nav aria-label="Folder path" className="flex min-w-0 flex-1 items-center overflow-hidden">
          <button type="button" className="shrink-0 rounded px-1 hover:bg-zinc-200 dark:hover:bg-zinc-800" onClick={() => go("")}>
            ~
          </button>
          {crumbs.map((part, i) => (
            <span key={crumbs.slice(0, i + 1).join("/")} className={`flex min-w-0 items-center ${i < crumbs.length - 1 ? "shrink" : "shrink-0"}`}>
              <span className="px-0.5 text-zinc-400">/</span>
              <button
                type="button"
                className={`truncate rounded px-1 hover:bg-zinc-200 dark:hover:bg-zinc-800 ${i === crumbs.length - 1 ? "font-medium" : "text-zinc-500"}`}
                onClick={() => go(crumbs.slice(0, i + 1).join("/"))}
              >
                {part}
              </button>
            </span>
          ))}
        </nav>
        <button type="button" aria-label="Open in Finder" title="Open in Finder" className={ICON_BUTTON} onClick={() => openPathIn(LOCAL_ROOT, current, "finder")}>
          <FolderOpen size={13} />
        </button>
        <button type="button" aria-label="Open in Terminal" title="Open in Terminal" className={ICON_BUTTON} onClick={() => openPathIn(LOCAL_ROOT, current, "terminal")}>
          <SquareTerminal size={13} />
        </button>
        <button type="button" aria-label="Open in VS Code" title="Open in VS Code" className={ICON_BUTTON} onClick={() => openPathIn(LOCAL_ROOT, current, "vscode")}>
          <Code2 size={13} />
        </button>
      </div>

      <div className="px-2 pb-2">
        <input
          className="w-full rounded-md border border-zinc-300 bg-transparent px-2 py-1 text-xs dark:border-zinc-700"
          placeholder="Filter this folder"
          aria-label="Filter this folder"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-3">
        {listing === undefined && error === undefined && (
          <p className="flex items-center gap-2 px-2 py-4 text-xs text-zinc-500">
            <LoaderCircle size={12} className="animate-spin" aria-hidden />
            Loading folder…
          </p>
        )}
        {error !== undefined && (
          <div className="px-2 py-4 text-xs">
            <p className="text-red-600 dark:text-red-400">Couldn&apos;t open this folder: {error}</p>
            <button type="button" className="mt-2 text-teal-700 underline dark:text-teal-400" onClick={() => go("")}>
              Back to home
            </button>
          </div>
        )}
        {error === undefined && listing !== undefined && entries.length === 0 && (
          <p className="px-2 py-4 text-xs text-zinc-500">{query === "" ? "This folder is empty." : "Nothing here matches."}</p>
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
                      selected ? "bg-teal-100/70 dark:bg-teal-900/40" : "hover:bg-zinc-200/60 dark:hover:bg-zinc-800/70"
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
