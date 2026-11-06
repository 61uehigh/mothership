"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CommandPalette } from "@/workbench/CommandPalette";
import { ShellContext, type PaletteMode, type Shell } from "@/shell/ShellContext";
import { CommandProvider, useCommands, type Command } from "@/shell/commands/CommandProvider";
import { ShortcutHelp } from "@/workbench/ShortcutHelp";
import { NewAgentDialog } from "@/features/sessions/ui/NewAgentDialog";
import type { NewAgentDraft } from "@/features/sessions/model/NewAgentDraft";
import { useBrowserNotifications } from "@/features/notifications/ui/useBrowserNotifications";
import { useLiveAgents } from "@/features/sessions/ui/useLiveAgents";
import { Workbench } from "@/workbench/Workbench";
import { useWorkbench, WorkbenchProvider } from "@/shell/WorkbenchContext";
import { FeedbackFlow } from "@/features/feedback/ui/FeedbackFlow";
import type { SettingsView } from "@/features/settings/model/Settings";
import { SETTINGS_CHANGED_EVENT } from "@/shell/events";
import { useJson } from "@/ui/useJson";
import { watchPageErrors } from "@/ui/pageErrors";

function ShellBody({ children }: { children: ReactNode }) {
  const live = useLiveAgents();
  const workbench = useWorkbench();
  const notifications = useBrowserNotifications(live.agents, live.subscribe, workbench.open);
  const [draft, setDraft] = useState<NewAgentDraft | undefined>(undefined);
  const [creating, setCreating] = useState(false);
  const [palette, setPalette] = useState<{ mode: PaletteMode; query: string } | undefined>(undefined);
  const [help, setHelp] = useState(false);
  const [feedback, setFeedback] = useState(false);
  const settings = useJson<SettingsView>("/api/settings");
  const developerMode = settings.data?.developer.enabled === true;
  const { reload: reloadSettings } = settings;
  useEffect(() => {
    window.addEventListener(SETTINGS_CHANGED_EVENT, reloadSettings);
    return () => window.removeEventListener(SETTINGS_CHANGED_EVENT, reloadSettings);
  }, [reloadSettings]);

  // Commands register once; they read the latest state through this ref.
  const latest = useRef({ workbench, questions: live.questions });
  useEffect(() => {
    latest.current = { workbench, questions: live.questions };
  });

  const { subscribe } = live;
  useEffect(
    () =>
      subscribe((update) => {
        if (update.type !== "agentDeleted") return;
        latest.current.workbench.closeMany([`session:${update.agentId}`, `changes:${update.agentId}`]);
      }),
    [subscribe],
  );

  const shell = useMemo<Shell>(
    () => ({
      ...live,
      openNewAgent: (next) => {
        setDraft(next);
        setCreating(true);
      },
      openPalette: (mode, query = "") => setPalette({ mode, query }),
      openHelp: () => setHelp(true),
      notifications,
      developerMode,
      openFeedback: () => setFeedback(true),
    }),
    [live, notifications, developerMode],
  );

  const commands = useMemo<Array<Command>>(
    () => [
      { id: "quick-open", title: "Go to anything", group: "General", keys: ["mod+p"], run: () => setPalette({ mode: "everything", query: "" }), hidden: true },
      { id: "palette", title: "Command palette", group: "General", keys: ["mod+k", "mod+shift+p"], run: () => setPalette({ mode: "commands", query: "" }), hidden: true },
      { id: "search", title: "Search all tools", group: "General", keys: ["mod+shift+f"], run: () => setPalette({ mode: "search", query: "" }) },
      { id: "help", title: "Keyboard shortcuts", group: "General", keys: ["shift+/"], run: () => setHelp(true) },
      { id: "go-agents", title: "Open the agent graph", group: "Navigation", keys: ["g a"], run: () => latest.current.workbench.open({ kind: "graph" }) },
      { id: "go-calendar", title: "Open the calendar (day and week)", group: "Navigation", keys: ["g c"], run: () => latest.current.workbench.open({ kind: "calendar" }) },
      { id: "go-inbox", title: "Open agents' questions", group: "Navigation", keys: ["g q"], run: () => latest.current.workbench.open({ kind: "inbox" }) },
      { id: "go-inbox-section", title: "Show Inbox", group: "Navigation", keys: ["g i"], run: () => latest.current.workbench.revealSection("inbox") },
      {
        id: "next-question",
        title: "Go to the next unanswered question",
        group: "Navigation",
        keys: ["n"],
        run: () => {
          const next = latest.current.questions.filter((q) => q.status === "open").sort((a, b) => a.createdAt - b.createdAt)[0];
          latest.current.workbench.open({ kind: "inbox", questionId: next?.id });
        },
      },
      {
        id: "new-agent",
        title: "New session",
        group: "Sessions",
        keys: ["c"],
        run: () => {
          setDraft(undefined);
          setCreating(true);
        },
      },
    ],
    [],
  );
  useCommands(commands);
  // Only in developer mode, so they stay out of the command center otherwise.
  const developerCommands = useMemo<Array<Command>>(
    () =>
      developerMode
        ? [
            { id: "feedback", title: "Give feedback on this screen", group: "Developer", keys: ["mod+alt+f"], run: () => setFeedback(true) },
            { id: "open-debug", title: "Open the debug panel", group: "Developer", keys: [], run: () => latest.current.workbench.open({ kind: "debug" }) },
          ]
        : [],
    [developerMode],
  );
  useCommands(developerCommands);
  useEffect(() => watchPageErrors(), []);

  return (
    <ShellContext.Provider value={shell}>
      <Workbench />
      {/* Route pages only translate old URLs into tabs and render nothing. */}
      {children}

      {creating && (
        <NewAgentDialog
          draft={draft}
          onClose={() => setCreating(false)}
          onCreated={(tab) => {
            setCreating(false);
            workbench.open(tab);
          }}
        />
      )}
      {palette !== undefined && (
        <CommandPalette initialMode={palette.mode} initialQuery={palette.query} onClose={() => setPalette(undefined)} />
      )}
      {help && <ShortcutHelp onClose={() => setHelp(false)} />}
      {feedback && <FeedbackFlow onClose={() => setFeedback(false)} />}
    </ShellContext.Provider>
  );
}

/**
 * ### AppShell
 *
 * App-wide frame: command registry, workbench state, one live-agents
 * connection shared by everything, the workbench UI, and global dialogs.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <CommandProvider>
      <WorkbenchProvider>
        <ShellBody>{children}</ShellBody>
      </WorkbenchProvider>
    </CommandProvider>
  );
}
