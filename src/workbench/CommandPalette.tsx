"use client";

import { Bot, FileCode2, Search, Terminal } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useShell, type PaletteMode } from "@/shell/ShellContext";
import { useCommandList } from "@/shell/commands/CommandProvider";
import { formatBinding } from "@/shell/commands/keys";
import { draftFor } from "@/features/tools/ui/delegation";
import { Modal } from "@/ui/Modal";
import { fetchJson } from "@/ui/useJson";
import { tabEntry } from "@/workbench/registry";
import { useWorkbench } from "@/shell/WorkbenchContext";
import type { DashboardItem, SearchGroup, ToolKind } from "@/features/tools/model/Dashboard";

const SEARCH_DEBOUNCE_MS = 350;
const MIN_TOOL_QUERY = 3;
const MAX_FILES = 30;

const PREFIX: Record<PaletteMode, string> = { everything: "", commands: ">", search: "#" };

type Row =
  | { kind: "command"; id: string; title: string; group: string; keys: Array<string>; run: () => void | boolean }
  | { kind: "tab"; key: string; title: string; icon: ReactNode }
  | { kind: "session"; id: string; title: string; detail: string }
  | { kind: "file"; path: string }
  | { kind: "result"; tool: ToolKind; item: DashboardItem };

type SearchState =
  | { status: "idle" }
  | { status: "loading"; query: string }
  | { status: "done"; query: string; groups: Array<SearchGroup>; error?: string };

/** Subsequence match, so "sesvw" finds "SessionView". */
function fuzzy(text: string, query: string): boolean {
  if (query === "") return true;
  const haystack = text.toLowerCase();
  if (haystack.includes(query)) return true;
  let i = 0;
  for (const ch of haystack) if (ch === query[i]) i++;
  return i === query.length;
}

/**
 * ### CommandPalette
 *
 * The command center under the title bar, like VS Code's. Type to find a
 * tab, session, or file; prefix `>` for commands, `@` for sessions, `#` to
 * search Linear, Slack, Nuclino, and Calendar. Enter opens; ⌘Enter hands a
 * tool result to a new agent.
 */
export function CommandPalette({
  initialMode,
  initialQuery,
  onClose,
}: {
  initialMode: PaletteMode;
  initialQuery: string;
  onClose: () => void;
}) {
  const commands = useCommandList();
  const { agents, openNewAgent } = useShell();
  const workbench = useWorkbench();
  const [input, setInput] = useState(`${PREFIX[initialMode]}${initialQuery}`);
  const [cursor, setCursor] = useState(0);
  const [search, setSearch] = useState<SearchState>({ status: "idle" });
  const [files, setFiles] = useState<Array<string>>([]);
  const listRef = useRef<HTMLDivElement>(null);

  const prefix = input.startsWith(">") ? ">" : input.startsWith("@") ? "@" : input.startsWith("#") ? "#" : "";
  const query = input.slice(prefix.length).trim();
  const needle = query.toLowerCase();
  // Files come from the active session's folder, or the default folder.
  const root = workbench.active?.tab.kind === "session" || workbench.active?.tab.kind === "changes" ? workbench.active.tab.agentId : "workspace";
  const toolQuery = prefix === "#" || (prefix === "" && query.length >= MIN_TOOL_QUERY) ? query : "";

  useEffect(() => {
    if (prefix !== "") return;
    const controller = new AbortController();
    fetch(`/api/files?root=${encodeURIComponent(root)}`, { signal: controller.signal })
      // Trusted: produced by our own /api/files route.
      .then((r) => (r.ok ? (r.json() as Promise<{ files: Array<string> }>) : { files: [] }))
      .then((data) => setFiles(data.files))
      .catch(() => {
        // The explorer may be unavailable (e.g. not a git folder); file results are simply omitted.
      });
    return () => controller.abort();
  }, [root, prefix]);

  useEffect(() => {
    if (toolQuery === "") return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearch({ status: "loading", query: toolQuery });
      void fetchJson<Array<SearchGroup>>(`/api/search?q=${encodeURIComponent(toolQuery)}`, { signal: controller.signal }).then((result) => {
        // A newer keystroke aborted this request; its replacement will report.
        if (controller.signal.aborted) return;
        setSearch(result.ok ? { status: "done", query: toolQuery, groups: result.data } : { status: "done", query: toolQuery, groups: [], error: result.error });
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [toolQuery]);

  const rows = useMemo<Array<Row>>(() => {
    const out: Array<Row> = [];
    if (prefix === ">") {
      for (const c of commands) {
        if (!c.hidden && fuzzy(`${c.title} ${c.group}`, needle)) {
          out.push({ kind: "command", id: c.id, title: c.title, group: c.group, keys: c.keys, run: c.run });
        }
      }
      return out.sort((a, b) => (a.kind === "command" && b.kind === "command" ? a.group.localeCompare(b.group) : 0));
    }
    if (prefix === "") {
      // A few everyday actions (Terminal, Explorer) are offered without typing `>`.
      for (const c of commands) {
        if (c.featured === true && !c.hidden && fuzzy(c.title, needle)) {
          out.push({ kind: "command", id: c.id, title: c.title, group: c.group, keys: c.keys, run: c.run });
        }
      }
      for (const open of workbench.tabs) {
        const entry = tabEntry(open.tab);
        const title = entry.title(open.tab, { agents });
        const Icon = entry.icon;
        if (fuzzy(title, needle)) out.push({ kind: "tab", key: open.key, title, icon: <Icon size={13} aria-hidden /> });
      }
    }
    if (prefix === "" || prefix === "@") {
      for (const agent of [...agents].sort((a, b) => b.lastActivityAt - a.lastActivityAt)) {
        if (fuzzy(`${agent.name} ${agent.role ?? ""} ${agent.worktree?.branch ?? ""}`, needle)) {
          out.push({
            kind: "session",
            id: agent.id,
            title: agent.name,
            detail: [agent.provider, agent.model, agent.worktree?.branch].filter(Boolean).join(" · "),
          });
        }
      }
    }
    if (prefix === "" && needle !== "") {
      out.push(...files.filter((f) => fuzzy(f, needle)).slice(0, MAX_FILES).map((path): Row => ({ kind: "file", path })));
    }
    if (search.status === "done" && search.query === toolQuery) {
      for (const group of search.groups) {
        if (group.result.status === "ok") out.push(...group.result.items.map((item): Row => ({ kind: "result", tool: group.kind, item })));
      }
    }
    return out;
  }, [prefix, needle, commands, workbench.tabs, agents, files, search, toolQuery]);
  const active = Math.min(cursor, Math.max(rows.length - 1, 0));

  useEffect(() => {
    listRef.current?.querySelector(`[data-row="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function activate(row: Row, delegate: boolean) {
    onClose();
    switch (row.kind) {
      case "command":
        row.run();
        return;
      case "tab":
        workbench.focus(row.key);
        return;
      case "session":
        workbench.open({ kind: "session", agentId: row.id });
        return;
      case "file":
        workbench.open({ kind: "file", root, path: row.path });
        return;
      case "result":
        if (delegate) openNewAgent(draftFor(row.tool, row.item));
        else if (row.tool === "nuclino") workbench.open({ kind: "doc", itemId: row.item.id, title: row.item.title });
        else if (row.tool === "linear") workbench.open({ kind: "issue", issueId: row.item.id, title: row.item.title });
        // Only web links: tool content decides this URL.
        else if (row.item.url !== undefined && /^https?:\/\//.test(row.item.url)) window.open(row.item.url, "_blank", "noopener");
    }
  }

  const loading = toolQuery !== "" && (search.status === "loading" || (search.status === "done" && search.query !== toolQuery));

  return (
    <Modal label="Command center" className="items-start justify-center px-4 pt-11 backdrop:bg-black/30" onClose={onClose}>
      <div className="flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-lg border border-zinc-300 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex items-center gap-2 border-b border-zinc-200 px-3 dark:border-zinc-800">
          <Search size={14} className="shrink-0 text-zinc-500" aria-hidden />
          <input
            data-autofocus
            className="w-full bg-transparent py-2.5 text-sm outline-none"
            placeholder="Search sessions and files · > commands · @ sessions · # all tools"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setCursor(0);
            }}
            onKeyDown={(e) => {
              // Esc closes through the dialog's own cancel.
              if (e.nativeEvent.isComposing) return;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor(Math.min(active + 1, rows.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor(Math.max(active - 1, 0));
              } else if (e.key === "Enter" && rows[active] !== undefined) {
                e.preventDefault();
                activate(rows[active], e.metaKey || e.ctrlKey);
              }
            }}
          />
        </div>

        <div ref={listRef} className="overflow-y-auto p-1">
          {loading && <p className="px-3 py-1.5 text-[11px] text-zinc-500">Searching tools…</p>}
          {search.status === "done" && search.query === toolQuery && search.error !== undefined && (
            <p className="px-3 py-1 text-[11px] text-red-600 dark:text-red-400">Search failed: {search.error}</p>
          )}
          {search.status === "done" &&
            search.query === toolQuery &&
            search.groups.map((g) =>
              g.result.status === "ok" ? undefined : (
                <p key={g.kind} className="px-3 py-1 text-[11px] text-zinc-500">
                  {g.title}: {g.result.status === "unavailable" ? g.result.reason : g.result.message}
                </p>
              ),
            )}
          {rows.length === 0 && !loading && (
            <p className="p-3 text-sm text-zinc-500">{prefix === "#" && query === "" ? "Type to search all tools." : "No results."}</p>
          )}
          {rows.map((row, index) => (
            <button
              key={`${row.kind}:${"key" in row ? row.key : "id" in row ? row.id : "path" in row ? row.path : `${row.tool}:${row.item.id}`}`}
              type="button"
              data-row={index}
              onMouseMove={() => setCursor(index)}
              onClick={(e) => activate(row, e.metaKey || e.ctrlKey)}
              className={`flex w-full items-center gap-2.5 rounded px-2.5 py-1.5 text-left text-[13px] ${index === active ? "bg-teal-100/70 dark:bg-teal-900/40" : ""}`}
            >
              {row.kind === "command" && (
                <>
                  <Terminal size={13} className="shrink-0 text-zinc-500" aria-hidden />
                  <span className="flex-1 truncate">{row.title}</span>
                  <span className="text-[11px] text-zinc-500">{row.group}</span>
                  {row.keys[0] !== undefined && <kbd className="font-mono text-[11px] text-zinc-500">{formatBinding(row.keys[0])}</kbd>}
                </>
              )}
              {row.kind === "tab" && (
                <>
                  <span className="shrink-0 text-zinc-500">{row.icon}</span>
                  <span className="flex-1 truncate">{row.title}</span>
                  <span className="text-[11px] text-zinc-500">open tab</span>
                </>
              )}
              {row.kind === "session" && (
                <>
                  <Bot size={13} className="shrink-0 text-zinc-500" aria-hidden />
                  <span className="truncate">{row.title}</span>
                  <span className="flex-1 truncate font-mono text-[11px] text-zinc-500">{row.detail}</span>
                  <span className="text-[11px] text-zinc-500">session</span>
                </>
              )}
              {row.kind === "file" && (
                <>
                  <FileCode2 size={13} className="shrink-0 text-zinc-500" aria-hidden />
                  <span className="truncate">{row.path.split("/").at(-1)}</span>
                  <span className="flex-1 truncate font-mono text-[11px] text-zinc-500">{row.path}</span>
                </>
              )}
              {row.kind === "result" && (
                <>
                  <span className="w-14 shrink-0 text-[11px] text-zinc-500">{row.tool}</span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{row.item.title}</span>
                    {row.item.subtitle !== undefined && <span className="truncate text-[11px] text-zinc-500">{row.item.subtitle}</span>}
                  </span>
                  {row.item.meta !== undefined && <span className="shrink-0 text-[11px] text-zinc-500">{row.item.meta}</span>}
                </>
              )}
            </button>
          ))}
        </div>

        <div className="flex gap-4 border-t border-zinc-200 px-3 py-1.5 text-[11px] text-zinc-500 dark:border-zinc-800">
          <span>↑↓ move</span>
          <span>↵ open</span>
          <span>{formatBinding("mod+enter")} hand off</span>
          <span className="ml-auto">&gt; commands · @ sessions · # tools</span>
        </div>
      </div>
    </Modal>
  );
}
