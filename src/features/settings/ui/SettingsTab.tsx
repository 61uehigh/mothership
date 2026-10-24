"use client";

import { Bell, BellOff, Bot, FolderOpen, Keyboard, Moon, Palette, PanelsLeftRight, Plug, Sun, User, Wrench, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useShell } from "@/shell/ShellContext";
import { formatBinding } from "@/shell/commands/keys";
import { ConnectionCard } from "@/features/settings/ui/ConnectionCard";
import { SETTINGS_CHANGED_EVENT } from "@/shell/events";
import { SecretField } from "@/features/settings/ui/SecretField";
import { SidebarsEditor } from "@/features/settings/ui/SidebarsEditor";
import { CheckAgainButton, CommandLine, ExternalButton, SetupButton, Steps } from "@/features/settings/ui/SetupSteps";
import { FolderField } from "@/ui/FolderField";
import { useTheme } from "@/ui/theme";
import { fetchJson, useJson } from "@/ui/useJson";
import { useStoredState } from "@/ui/useStoredState";
import type { CheckResult, ConnectionMode, SettingsView } from "@/features/settings/model/Settings";

type PageId = "agents" | "connections" | "tools" | "sidebars" | "profile" | "appearance";

const PAGES: ReadonlyArray<{ id: PageId; label: string; icon: LucideIcon }> = [
  { id: "agents", label: "Agents", icon: Bot },
  { id: "connections", label: "Connections", icon: Plug },
  { id: "tools", label: "Developer tools", icon: Wrench },
  { id: "sidebars", label: "Sidebars", icon: PanelsLeftRight },
  { id: "profile", label: "You", icon: User },
  { id: "appearance", label: "Appearance", icon: Palette },
];

const ROW = "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-zinc-100 dark:hover:bg-zinc-800/70";
const INPUT = "w-full rounded-md border border-zinc-300 bg-transparent px-2.5 py-1 text-xs dark:border-zinc-700";

function Section({ title, description, action, children }: { title: string; description?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">{title}</h2>
          {description !== undefined && <p className="mt-0.5 text-xs text-zinc-500">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Status({ label, purpose, check, children }: { label: string; /** What it is used for. */ purpose?: string; check: CheckResult; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex items-start gap-2">
        <span aria-hidden className={`mt-1.5 size-2 shrink-0 rounded-full ${check.ready ? "bg-green-500" : "bg-amber-500"}`} />
        <div className="min-w-0">
          <p className="text-sm">
            {label} <span className="sr-only">{check.ready ? "ready" : "not set up"}</span>
          </p>
          <p className="break-words text-xs text-zinc-500">{check.detail}</p>
          {purpose !== undefined && <p className="text-[11px] text-zinc-500">{purpose}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

/** One account's card, such as OpenAI's, with a status line for each kind of agent it runs. */
function Account({ label, agents, children }: { label: string; agents: Array<{ name: string; check: CheckResult }>; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <p className="text-sm">{label}</p>
      <ul className="flex flex-col gap-1">
        {agents.map(({ name, check }) => (
          <li key={name} className="flex items-start gap-2">
            <span aria-hidden className={`mt-1.5 size-2 shrink-0 rounded-full ${check.ready ? "bg-green-500" : "bg-amber-500"}`} />
            <p className="min-w-0 break-words text-xs text-zinc-500">
              <span className="text-zinc-700 dark:text-zinc-300">{name}</span> <span className="sr-only">{check.ready ? "ready" : "not set up"}</span>
              {check.detail}
            </p>
          </li>
        ))}
      </ul>
      {children}
    </div>
  );
}

function Profile({ view, onSave }: { view: SettingsView; onSave: (profile: Record<string, unknown>) => Promise<string | undefined> }) {
  const [names, setNames] = useState(view.profile.names.join(", "));
  const [slackUserId, setSlackUserId] = useState(view.profile.slackUserId ?? "");
  const [timezone, setTimezone] = useState(view.profile.timezone);
  const [state, setState] = useState<{ busy: boolean; message: string | undefined; failed: boolean }>({ busy: false, message: undefined, failed: false });

  async function save() {
    setState({ busy: true, message: undefined, failed: false });
    const error = await onSave({
      names: names
        .split(",")
        .map((n) => n.trim())
        .filter((n) => n.length >= 2),
      slackUserId: slackUserId.trim(),
      timezone: timezone.trim(),
    });
    setState({ busy: false, message: error ?? "Saved", failed: error !== undefined });
  }

  return (
    <form
      className="grid gap-3 rounded-lg border border-zinc-200 p-4 sm:grid-cols-2 dark:border-zinc-800"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <label className="flex flex-col gap-1 text-xs text-zinc-600 sm:col-span-2 dark:text-zinc-400">
        Names you go by
        <input className={INPUT} value={names} onChange={(e) => setNames(e.target.value)} placeholder="Jane Doe, Jane" />
        <span className="text-[11px] text-zinc-500">Comma-separated. Highlighted wherever Slack, Linear, or Nuclino mention you by name.</span>
      </label>
      <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
        Slack member ID
        <input className={`${INPUT} font-mono`} value={slackUserId} onChange={(e) => setSlackUserId(e.target.value)} placeholder="U0123456789" />
        <span className="text-[11px] text-zinc-500">Slack profile → ⋮ → Copy member ID. Finds your mentions and DMs.</span>
      </label>
      <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
        Time zone
        <input className={INPUT} value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="Asia/Seoul" />
        <span className="text-[11px] text-zinc-500">For the calendar and &ldquo;today&rdquo;.</span>
      </label>
      <div className="flex items-center gap-2 sm:col-span-2">
        <button type="submit" disabled={state.busy} className="rounded-md bg-teal-600 px-3 py-1 text-xs font-medium text-white hover:bg-teal-500 disabled:opacity-50">
          Save
        </button>
        {state.message !== undefined && (
          <span role="status" className={`text-xs ${state.failed ? "text-red-600 dark:text-red-400" : "text-green-700 dark:text-green-400"}`}>
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}

function DefaultFolder({ view, onSave }: { view: SettingsView; onSave: (folder: string) => Promise<string | undefined> }) {
  const [folder, setFolder] = useState(view.defaultFolder.chosen ?? "");
  const [state, setState] = useState<{ busy: boolean; message: string | undefined; failed: boolean }>({ busy: false, message: undefined, failed: false });
  const unchanged = folder.trim() === (view.defaultFolder.chosen ?? "");

  async function save(value: string) {
    setState({ busy: true, message: undefined, failed: false });
    const error = await onSave(value);
    setState({ busy: false, message: error ?? "Saved", failed: error !== undefined });
  }

  return (
    <form
      className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
      onSubmit={(event) => {
        event.preventDefault();
        void save(folder.trim());
      }}
    >
      <FolderField
        className={`${INPUT} font-mono`}
        placeholder={`${view.defaultFolder.fallback} (your home folder)`}
        value={folder}
        onChange={setFolder}
        onError={(message) => setState({ busy: false, message, failed: message !== undefined })}
      />
      <div className="flex items-center gap-2">
        <button type="submit" disabled={state.busy || unchanged} className="rounded-md bg-teal-600 px-3 py-1 text-xs font-medium text-white hover:bg-teal-500 disabled:opacity-50">
          Save
        </button>
        {view.defaultFolder.chosen !== undefined && (
          <button
            type="button"
            disabled={state.busy}
            className="rounded-md px-2 py-1 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
            onClick={() => {
              setFolder("");
              void save("");
            }}
          >
            Use home folder
          </button>
        )}
        {state.message !== undefined && (
          <span role="status" className={`text-xs ${state.failed ? "text-red-600 dark:text-red-400" : "text-green-700 dark:text-green-400"}`}>
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}

/**
 * ### SettingsTab
 *
 * Settings as a full tab, one page at a time from a side menu: the agents
 * you can run and the folder sessions work in by default, how each work tool connects (token or claude.ai connector),
 * developer tools, your profile, and appearance. Pages that need attention
 * carry a dot, and the last page shown is remembered. On a fresh install it
 * opens by itself with a welcome note. Tokens are saved to `.env.local` and never shown again.
 */
export function SettingsTab() {
  const fetched = useJson<SettingsView>("/api/settings");
  const [page, setPage] = useStoredState<PageId>("mothership.settings.page", "agents", (raw) => PAGES.find((p) => p.id === raw)?.id, (id) => id);
  const [saved, setSaved] = useState<SettingsView | undefined>(undefined);
  const view = saved ?? fetched.data;
  const { theme, toggle } = useTheme();
  const { notifications, openHelp } = useShell();

  async function send(url: string, method: string, body: unknown): Promise<string | undefined> {
    const result = await fetchJson<SettingsView>(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!result.ok) return result.error;
    setSaved(result.data);
    window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
    return undefined;
  }
  const saveSecret = (name: string, value: string) => send("/api/settings/secrets", "PUT", { name, value });
  async function recheck() {
    const result = await fetchJson<SettingsView>("/api/settings");
    if (result.ok) setSaved(result.data);
  }
  const [folderError, setFolderError] = useState<string | undefined>(undefined);
  async function openConfigFolder() {
    const result = await fetchJson<{ folder: string }>("/api/settings/config-folder", { method: "POST" });
    setFolderError(result.ok ? undefined : result.error);
  }

  if (view === undefined) {
    return <p className="p-6 text-sm text-zinc-500">{fetched.error ?? "Checking your setup…"}</p>;
  }
  const secretOf = (name: string) => view.agentSecrets.find((s) => s.name === name) ?? { name, set: false };

  const attention: Record<PageId, boolean> = {
    agents: !Object.values(view.agents).some((check) => check.ready),
    connections: view.connections.some((c) => c.mode === "mcp" && c.secrets.some((secret) => !secret.set)),
    tools: !view.tools.github.ready || !view.tools.docker.ready,
    profile: false,
    appearance: false,
    sidebars: false,
  };

  // An arrow function, so `view` stays narrowed to defined inside it.
  const content = (id: PageId): ReactNode => {
    switch (id) {
      case "agents":
        return (
          <>
          <Section title="Agents" description="At least one is needed to start sessions." action={<CheckAgainButton onCheck={recheck} />}>
            <Account label="Anthropic" agents={[{ name: "Claude", check: view.agents.claude }]}>
              {!secretOf("ANTHROPIC_API_KEY").set && (
                <div>
                  <SetupButton action="claude-login" label={view.agents.claude.ready ? "Switch account" : "Log in to Claude"} primary={!view.agents.claude.ready} />
                </div>
              )}
              <SecretField
                secret={secretOf("ANTHROPIC_API_KEY")}
                label="Anthropic API key (optional; Claude uses it instead of your Claude login)"
                placeholder="sk-ant-…"
                kind="token"
                onSave={(v) => saveSecret("ANTHROPIC_API_KEY", v)}
              />
            </Account>
            <Account
              label="OpenAI"
              agents={[
                { name: "Codex", check: view.agents.codex },
                { name: "OpenAI agents", check: view.agents.openai },
              ]}
            >
              {!secretOf("OPENAI_API_KEY").set && (
                <div>
                  <SetupButton action="codex-login" label={view.agents.codex.ready ? "Switch account" : "Log in with ChatGPT"} primary={!view.agents.codex.ready} />
                </div>
              )}
              <SecretField
                secret={secretOf("OPENAI_API_KEY")}
                label="OpenAI API key (needed for OpenAI agents; Codex uses it instead of your ChatGPT login)"
                placeholder="sk-…"
                kind="token"
                onSave={(v) => saveSecret("OPENAI_API_KEY", v)}
              />
            </Account>
          </Section>
          <Section title="Default folder" description="Where a new session works when you leave its folder empty. Your home folder until you choose one.">
            <DefaultFolder view={view} onSave={(folder) => send("/api/settings", "PATCH", { defaultFolder: folder })} />
          </Section>
          </>
        );
      case "connections":
        return (
          <Section
            title="Connections"
            description="How the sidebar and agents reach your work tools. Token uses the tool's own MCP server; Claude connector uses one you connected in claude.ai."
          >
            {view.customConfig !== undefined && (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
                Using {view.customConfig} (demo mode), so the choices below are not applied.
              </p>
            )}
            {view.connections.map((connection) => (
              <ConnectionCard
                key={connection.id}
                connection={connection}
                locked={view.customConfig !== undefined}
                onMode={(mode: ConnectionMode | "default") => void send("/api/settings", "PATCH", { connections: { [connection.id]: mode } })}
                onSecret={saveSecret}
              />
            ))}
          </Section>
        );
      case "tools":
        return (
          <Section
            title="Developer tools"
            description="mothership uses these from your Mac; nothing to set up here unless one isn't ready."
            action={<CheckAgainButton onCheck={recheck} />}
          >
            <Status label="GitHub CLI" purpose="For the GitHub section: pull requests, issues, and runs." check={view.tools.github}>
              {view.tools.github.fix === "install" && (
                <Steps>
                  {[
                    <>
                      Install it with Homebrew: <CommandLine command="brew install gh" /> or <ExternalButton href="https://cli.github.com">download it</ExternalButton>
                    </>,
                    <>
                      Then log in: <SetupButton action="gh-login" label="Log in to GitHub" />
                    </>,
                  ]}
                </Steps>
              )}
              {view.tools.github.fix === "login" && (
                <div>
                  <SetupButton action="gh-login" label="Log in to GitHub" primary />
                </div>
              )}
            </Status>
            <Status label="Docker" purpose="For the Docker section: containers, logs, and actions." check={view.tools.docker}>
              {view.tools.docker.fix === "install" && (
                <Steps>
                  {[
                    <>
                      Install Docker Desktop: <ExternalButton href="https://www.docker.com/products/docker-desktop/" primary>Download</ExternalButton>
                    </>,
                    <>
                      Open it once, then: <SetupButton action="docker-start" label="Start Docker" />
                    </>,
                  ]}
                </Steps>
              )}
              {view.tools.docker.fix === "start" && (
                <div>
                  <SetupButton action="docker-start" label="Start Docker" primary />
                </div>
              )}
            </Status>
          </Section>
        );
      case "sidebars":
        return (
          <Section title="Sidebars" description="Which sections each sidebar shows, top to bottom. Drag them, or use the buttons.">
            <SidebarsEditor />
          </Section>
        );
      case "profile":
        return (
          <Section title="You">
            <Profile view={view} onSave={(profile) => send("/api/settings", "PATCH", { profile })} />
          </Section>
        );
      case "appearance":
        return (
          <Section title="Appearance">
            <div className="flex flex-col gap-0.5 rounded-lg border border-zinc-200 p-1 dark:border-zinc-800">
              <button type="button" className={ROW} onClick={toggle}>
                {theme === "dark" ? <Moon size={14} aria-hidden /> : <Sun size={14} aria-hidden />}
                <span className="flex-1">Theme</span>
                <span className="text-xs text-zinc-500">{theme === "dark" ? "Dark" : "Light"}</span>
              </button>
              {notifications.state !== "unsupported" && (
                <button type="button" className={ROW} onClick={notifications.toggle}>
                  {notifications.state === "granted" ? <Bell size={14} aria-hidden /> : <BellOff size={14} aria-hidden />}
                  <span className="flex-1">Browser notifications</span>
                  <span className="text-xs text-zinc-500">
                    {notifications.state === "granted" ? "On" : notifications.state === "muted" ? "Muted" : notifications.state === "denied" ? "Blocked" : "Not set"}
                  </span>
                </button>
              )}
              <button type="button" className={ROW} onClick={openHelp}>
                <Keyboard size={14} aria-hidden />
                <span className="flex-1">Keyboard shortcuts</span>
                <kbd className="text-xs text-zinc-500">{formatBinding("shift+/")}</kbd>
              </button>
            </div>
          </Section>
        );
    }
  };

  return (
    // Laid out by the tab's own width: a narrow center puts the menu in a row on top.
    <div className="@container flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 @max-2xl:flex-col">
      <nav
        aria-label="Settings"
        className="flex w-48 shrink-0 flex-col gap-0.5 border-r border-zinc-200 p-2 dark:border-zinc-800 @max-2xl:w-auto @max-2xl:flex-row @max-2xl:overflow-x-auto @max-2xl:border-r-0 @max-2xl:border-b"
      >
        <h1 className="px-2 pt-1 pb-2 text-sm font-semibold @max-2xl:hidden">Settings</h1>
        {PAGES.map(({ id, label, icon: Icon }) => {
          const current = id === page;
          return (
            <button
              key={id}
              type="button"
              aria-current={current ? "page" : undefined}
              onClick={() => setPage(id)}
              className={`flex shrink-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] ${
                current
                  ? "bg-zinc-200 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                  : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100"
              }`}
            >
              <Icon size={14} aria-hidden className="shrink-0" />
              <span className="flex-1 whitespace-nowrap">{label}</span>
              {attention[id] && (
                <>
                  <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-amber-500" />
                  <span className="sr-only">(needs attention)</span>
                </>
              )}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => void openConfigFolder()}
          title={folderError ?? "Advanced settings (roles, sidebar widgets, shortcuts) live in these files"}
          className="mt-auto flex shrink-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100 @max-2xl:mt-0 @max-2xl:ml-auto"
        >
          <FolderOpen size={14} aria-hidden className="shrink-0" />
          <span className="whitespace-nowrap">Open config folder</span>
        </button>
        {folderError !== undefined && (
          <p role="alert" className="px-2 text-[11px] text-red-600 @max-2xl:hidden dark:text-red-400">
            {folderError}
          </p>
        )}
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-6 @max-md:px-4">
          {view.setupNeeded && (
            <div className="flex flex-col gap-2 rounded-lg border border-teal-300 bg-teal-50 p-4 text-sm dark:border-teal-900 dark:bg-teal-950/40">
              <p className="font-medium">Welcome to mothership</p>
              <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                Set up the parts you use; everything is optional except one way to run agents. Connect each work tool with a token, or use the
                claude.ai connectors you already have. Items marked with a dot need attention. You can come back here any time from the gear at the
                top right.
              </p>
              <button
                type="button"
                className="self-start rounded-md bg-teal-600 px-3 py-1 text-xs font-medium text-white hover:bg-teal-500"
                onClick={() => void send("/api/settings", "PATCH", { setupDone: true })}
              >
                Finish setup
              </button>
            </div>
          )}
          {content(page)}
        </div>
      </div>
      </div>
    </div>
  );
}
