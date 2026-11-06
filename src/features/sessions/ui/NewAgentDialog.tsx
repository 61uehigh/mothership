"use client";

import { useEffect, useState } from "react";
import { FolderField } from "@/ui/FolderField";
import { Modal } from "@/ui/Modal";
import { fetchJson } from "@/ui/useJson";
import { useStoredState } from "@/ui/useStoredState";
import type { Tab } from "@/shell/tabs";
import type { Agent } from "@/features/sessions/model/Agent";
import { AGENT_KINDS, EFFORTS, type AgentKind, type Effort } from "@/features/sessions/model/AgentEvents";
import type { NewAgentDraft } from "@/features/sessions/model/NewAgentDraft";
import type { Role } from "@/features/sessions/model/Roles";


const LAST_REPO_KEY = "mothership.lastRepo";
const REPO_CHECK_DEBOUNCE_MS = 400;

const parseLastRepo = (raw: string): string => raw;

const isAgentKind = (value: string): value is AgentKind => AGENT_KINDS.some((kind) => kind === value);
const isEffort = (value: string): value is Effort => EFFORTS.some((effort) => effort === value);

const FIELD = "w-full rounded-md border border-zinc-300 bg-transparent px-2.5 py-1.5 text-sm dark:border-zinc-700";

/** The role a new session gets unless you pick another under More options. */
const DEFAULT_ROLE = "lead";

/** A session name from the task's first line, e.g. "Fix the login redirect bug". */
function nameFromTask(task: string): string {
  const firstLine = task.trim().split("\n")[0] ?? "";
  return firstLine.length <= 48 ? firstLine : `${firstLine.slice(0, 47).trimEnd()}…`;
}

/**
 * ### NewAgentDialog
 *
 * Starts a session: you give a task and a folder, and a lead takes it on,
 * creating whatever sub-agents (with their own providers and models) the
 * work needs. Under More options you can pick another role, provider, or
 * model, work in a worktree, or start a compare run. Esc closes it.
 */
export function NewAgentDialog({
  draft,
  onCreated,
  onClose,
}: {
  draft: NewAgentDraft | undefined;
  /** Called with the tab to show next: the new session, or the comparison. */
  onCreated: (tab: Tab) => void;
  onClose: () => void;
}) {
  // An empty folder falls back to the default folder.
  const [lastRepo, setLastRepo] = useStoredState(LAST_REPO_KEY, "", parseLastRepo);
  const [repo, setRepo] = useState(() => draft?.repo ?? lastRepo);
  // `undefined` until checked; `root` is `undefined` when the folder is not in a git repository.
  const [repoCheck, setRepoCheck] = useState<{ root: string | undefined } | undefined>(undefined);
  const notARepo = repoCheck !== undefined && repoCheck.root === undefined;
  const [worktree, setWorktree] = useState(draft?.worktree ?? false);
  const [compare, setCompare] = useState(false);
  /** A compare run needs a git repository; outside one the box is off whatever it was. */
  const comparing = compare && !notARepo;
  const [allowGit, setAllowGit] = useState(false);
  const [attempts, setAttempts] = useState<Array<AgentKind>>(["claude", "codex"]);
  const [roles, setRoles] = useState<Array<Role>>([]);
  const [repositories, setRepositories] = useState<Array<string>>([]);
  /** Where the session works when the folder is left empty (from Settings). */
  const [defaultFolder, setDefaultFolder] = useState<string | undefined>(undefined);
  const [name, setName] = useState(draft?.name ?? "");
  const [role, setRole] = useState(DEFAULT_ROLE);
  const [provider, setProvider] = useState<AgentKind>("claude");
  const [model, setModel] = useState("");
  const [effort, setEffort] = useState<Effort | "">("");
  const [mcp, setMcp] = useState<Array<string> | undefined>(undefined);
  const [initialMessage, setInitialMessage] = useState(draft?.initialMessage ?? "");
  const [error, setError] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void fetch("/api/repositories")
      // Trusted: produced by our own /api/repositories route.
      .then((r) => r.json() as Promise<{ repositories: Array<string>; defaultFolder: string }>)
      .then((data) => {
        setRepositories(data.repositories);
        setDefaultFolder(data.defaultFolder);
      });
  }, []);

  useEffect(() => {
    void fetch("/api/roles")
      // Trusted: produced by our own /api/roles route.
      .then((r) => r.json() as Promise<Array<Role>>)
      .then((list) => {
        setRoles(list);
        applyRole(draft?.role ?? DEFAULT_ROLE, list);
      });
    // Runs once on open; the draft is fixed for the dialog's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/repo?dir=${encodeURIComponent(repo.trim())}`, { signal: controller.signal })
        // Trusted: produced by our own /api/repo route.
        .then((r) => r.json() as Promise<{ root: string | null }>)
        .then((data) => setRepoCheck({ root: data.root ?? undefined }))
        .catch((error: unknown) => {
          // A newer keystroke aborted this check; its replacement will report.
          if (!(error instanceof DOMException && error.name === "AbortError")) throw error;
        });
    }, REPO_CHECK_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [repo]);

  function applyRole(roleName: string, list: Array<Role> = roles) {
    setRole(roleName);
    const preset = list.find((r) => r.name === roleName);
    if (preset === undefined) {
      setMcp(undefined);
      return;
    }
    setProvider(preset.provider);
    setModel(preset.model ?? "");
    setEffort(preset.effort ?? "");
    setMcp(preset.mcp);
    setWorktree(preset.worktree);
  }

  async function submit() {
    setSubmitting(true);
    setError(undefined);
    const repoValue = repo.trim() === "" ? undefined : repo.trim();
    // An empty name is taken from the task, so the task is all you have to write.
    const sessionName = name.trim() !== "" ? name.trim() : nameFromTask(initialMessage);
    setLastRepo(repo.trim());
    try {
      // Worktrees and compare runs need a git repository; a box shown disabled must not still be sent as on.
      const result = comparing
        ? await fetchJson<{ group: string }>("/api/compare", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: sessionName,
              task: initialMessage,
              role: role === "" ? undefined : role,
              mcp,
              repo: repoValue,
              attempts: attempts.map((p) => ({ provider: p, effort: effort === "" ? undefined : effort })),
            }),
          })
        : await fetchJson<Agent>("/api/agents", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: sessionName,
              provider,
              role: role === "" ? undefined : role,
              model: model.trim() === "" ? undefined : model.trim(),
              effort: effort === "" ? undefined : effort,
              parentId: undefined,
              mcp,
              initialMessage: initialMessage.trim() === "" ? undefined : initialMessage,
              repo: repoValue,
              worktree: worktree && !notARepo,
              allowGit: allowGit && provider === "claude",
            }),
          });
      if (!result.ok) setError(result.error);
      else onCreated("group" in result.data ? { kind: "compare", group: result.data.group } : { kind: "session", agentId: result.data.id });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal label="New session" className="items-end justify-center backdrop:bg-black/50 sm:items-center" onClose={onClose}>
      <form
        className="flex max-h-[90dvh] w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-t-xl bg-white p-5 sm:rounded-xl dark:bg-zinc-900"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <h2 className="text-lg font-semibold">New session</h2>

        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          {comparing ? "Task (sent identically to every agent)" : "What should get done?"}
          <textarea
            className={`${FIELD} min-h-28`}
            data-autofocus
            placeholder="Describe the goal. The lead plans it, creates the sub-agents it needs, and reports back."
            value={initialMessage} onChange={(e) => setInitialMessage(e.target.value)} />
        </label>

        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          Working folder
          <FolderField
            className={`${FIELD} font-mono`}
            placeholder={defaultFolder === undefined ? undefined : `${defaultFolder} (default)`}
            list="repository-suggestions"
            value={repo}
            onChange={setRepo}
            onError={setError}
          />
          <datalist id="repository-suggestions">
            {repositories.map((dir) => (
              <option key={dir} value={dir} />
            ))}
          </datalist>
          {/* Left empty, the default folder is used as it is; only a folder you typed gets a warning. */}
          <span className={notARepo && repo.trim() !== "" ? "text-amber-600" : ""}>
            {repoCheck === undefined || repo.trim() === ""
              ? "Leave empty to use the default folder (change it in Settings → Agents)."
              : notARepo
                ? "Not a git repository. Worktrees and compare runs are unavailable."
                : `Git repository: ${repoCheck.root}`}
          </span>
        </label>

        <details className="group rounded-md border border-zinc-200 dark:border-zinc-700">
          <summary className="cursor-pointer list-none px-2.5 py-1.5 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
            <span className="mr-1 inline-block transition-transform group-open:rotate-90" aria-hidden>
              ›
            </span>
            More options <span className="text-zinc-400">· {comparing ? "compare run" : `${role === "" ? "no role" : role}, ${provider}${worktree ? ", worktree" : ""}`}</span>
          </summary>
          <div className="flex flex-col gap-3 border-t border-zinc-200 p-2.5 dark:border-zinc-700">
          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            Role
            <select className={FIELD} value={role} onChange={(e) => applyRole(e.target.value)}>
              <option value="">None</option>
              {roles.map((r) => (
                <option key={r.name} value={r.name}>
                  {r.name} — {r.description}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            Name
            <input className={FIELD} placeholder={nameFromTask(initialMessage) || "Taken from the task"} value={name} onChange={(e) => setName(e.target.value)} />
          </label>

          <div className="flex flex-col gap-1.5 rounded-md border border-zinc-200 p-2.5 text-sm dark:border-zinc-700">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={!notARepo && (worktree || comparing)}
                disabled={comparing || notARepo}
                onChange={(e) => setWorktree(e.target.checked)}
              />
              Work in a separate worktree <span className="text-xs text-zinc-500">Review changes before merging</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={comparing} disabled={notARepo} onChange={(e) => setCompare(e.target.checked)} />
              Compare run <span className="text-xs text-zinc-500">Give the same task to several agents, then pick one to merge</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={allowGit && provider === "claude" && !comparing}
                disabled={comparing || provider !== "claude"}
                onChange={(e) => setAllowGit(e.target.checked)}
              />
              Allow git{" "}
              <span className="text-xs text-zinc-500">
                {provider === "claude" ? "Commits, history edits, fetch; every push asks you first" : "Claude sessions only"}
              </span>
            </label>
            {comparing && (
              <div className="flex gap-3 pl-6 text-xs">
                {AGENT_KINDS.filter((k) => k !== "openai").map((k) => (
                  <label key={k} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={attempts.includes(k)}
                      onChange={(e) => setAttempts((list) => (e.target.checked ? [...list, k] : list.filter((x) => x !== k)))}
                    />
                    {k}
                  </label>
                ))}
                <span className="text-zinc-500">(openai is excluded because it cannot edit files)</span>
              </div>
            )}
          </div>

          <div className={`grid grid-cols-3 gap-2 ${comparing ? "hidden" : ""}`}>
            <label className="flex flex-col gap-1 text-xs text-zinc-500">
              Provider
              <select className={FIELD} value={provider} onChange={(e) => isAgentKind(e.target.value) && setProvider(e.target.value)}>
                {AGENT_KINDS.map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-zinc-500">
              Model
              <input className={FIELD} placeholder="Default" value={model} onChange={(e) => setModel(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-zinc-500">
              Effort
              <select className={FIELD} value={effort} onChange={(e) => setEffort(isEffort(e.target.value) ? e.target.value : "")}>
                <option value="">Default</option>
                {EFFORTS.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
          </div>

          <p className="text-xs text-zinc-500">
            MCP: {mcp === undefined ? "All enabled servers" : mcp.length === 0 ? "None" : mcp.join(", ")}
          </p>

          </div>
        </details>

        {error !== undefined && <p className="whitespace-pre-wrap text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" className="rounded-md px-4 py-1.5 text-sm" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={
              submitting || initialMessage.trim() === "" || (comparing && attempts.length < 2)
            }
            className="rounded-md bg-teal-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40"
          >
            {comparing ? `Compare run with ${attempts.length} agents` : "Start"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
