"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CommandPalette } from "@/workbench/CommandPalette";
import { LiveMessagesContext, ShellContext, type PaletteMode, type Shell } from "@/shell/shellContext";
import { CommandProvider, useCommands, type Command } from "@/shell/commands/commandContext";
import { ShortcutHelp } from "@/workbench/ShortcutHelp";
import { NewAgentDialog } from "@/features/sessions/ui/NewAgentDialog";
import type { NewAgentDraft } from "@/features/sessions/model/NewAgentDraft";
import { useBrowserNotifications } from "@/features/notifications/ui/useBrowserNotifications";
import { useLiveAgents } from "@/features/sessions/ui/useLiveAgents";
import { Workbench } from "@/workbench/Workbench";
import { SectionDragProvider } from "@/workbench/sectionDrag";
import { useWorkbenchActions, WorkbenchProvider } from "@/shell/workbenchContext";
import { FeedbackFlow } from "@/features/feedback/ui/FeedbackFlow";
import type { SettingsView } from "@/features/settings/model/Settings";
import { SETTINGS_CHANGED_EVENT } from "@/shell/events";
import { openQuestionsOldestFirst } from "@/shell/questions";
import { useJson } from "@/ui/useJson";
import { watchPageErrors } from "@/ui/pageErrors";
import { useT } from "@/ui/i18n/useT";
import { NoticeStack } from "@/ui/NoticeStack";
import { useTheme } from "@/ui/theme";
import { TooltipLayer } from "@/ui/TooltipLayer";

function ShellBody({ children }: { children: ReactNode }) {
  const live = useLiveAgents();
  const workbench = useWorkbenchActions();
  const notifications = useBrowserNotifications(live.agents, live.subscribe, workbench.open);
  const [draft, setDraft] = useState<NewAgentDraft | undefined>(undefined);
  const [creating, setCreating] = useState(false);
  // Who asked for the session being created, to hear its id; a ref, since only the dialog's callback reads it.
  const onAgentCreated = useRef<((agentId: string) => void) | undefined>(undefined);
  const [palette, setPalette] = useState<{ mode: PaletteMode; query: string } | undefined>(undefined);
  const [help, setHelp] = useState(false);
  const [feedback, setFeedback] = useState(false);
  const settings = useJson<SettingsView>("/api/settings", { remember: true });
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

  const { agents, questions, connected, messages } = live;
  const shell = useMemo<Shell>(
    () => ({
      agents,
      questions,
      connected,
      subscribe,
      openNewAgent: (next, onCreated) => {
        onAgentCreated.current = onCreated;
        setDraft(next);
        setCreating(true);
      },
      openPalette: (mode, query = "") => setPalette({ mode, query }),
      notifications,
      developerMode,
      openFeedback: () => setFeedback(true),
    }),
    [agents, questions, connected, subscribe, notifications, developerMode],
  );

  const t = useT();
  const commands = useMemo<Array<Command>>(
    () => [
      { id: "quick-open", title: t("command.goToAnything"), group: "General", keys: ["mod+p"], run: () => setPalette({ mode: "everything", query: "" }), hidden: true },
      { id: "palette", title: t("command.palette"), group: "General", keys: ["mod+k", "mod+shift+p"], run: () => setPalette({ mode: "commands", query: "" }), hidden: true },
      { id: "search", title: t("command.searchTools"), group: "General", keys: ["mod+shift+f"], run: () => setPalette({ mode: "search", query: "" }) },
      { id: "help", title: t("command.shortcuts"), group: "General", keys: ["shift+/"], run: () => setHelp(true) },
      { id: "go-agents", title: t("command.agentGraph"), group: "Navigation", keys: ["g a"], run: () => latest.current.workbench.open({ kind: "graph" }) },
      { id: "go-calendar", title: t("command.calendar"), group: "Navigation", keys: ["g c"], run: () => latest.current.workbench.open({ kind: "calendar" }) },
      { id: "go-inbox", title: t("command.questions"), group: "Navigation", keys: ["g q"], run: () => latest.current.workbench.open({ kind: "inbox" }) },
      { id: "go-inbox-section", title: t("command.showInbox"), group: "Navigation", keys: ["g i"], run: () => latest.current.workbench.revealSection("inbox") },
      {
        id: "next-question",
        title: t("command.nextQuestion"),
        group: "Navigation",
        keys: ["n"],
        run: () => {
          const next = openQuestionsOldestFirst(latest.current.questions)[0];
          latest.current.workbench.open({ kind: "inbox", questionId: next?.id });
        },
      },
      {
        id: "new-agent",
        title: t("command.newSession"),
        group: "Sessions",
        keys: ["c"],
        run: () => {
          onAgentCreated.current = undefined;
          setDraft(undefined);
          setCreating(true);
        },
      },
    ],
    [t],
  );
  useCommands(commands);
  // Only in developer mode, so they stay out of the command center otherwise.
  const developerCommands = useMemo<Array<Command>>(
    () =>
      developerMode
        ? [
            { id: "feedback", title: t("command.feedback"), group: "Developer", keys: ["mod+alt+f"], run: () => setFeedback(true) },
            { id: "open-debug", title: t("command.debug"), group: "Developer", keys: [], run: () => latest.current.workbench.open({ kind: "debug" }) },
          ]
        : [],
    [developerMode, t],
  );
  useCommands(developerCommands);
  useEffect(() => watchPageErrors(), []);

  return (
    <ShellContext.Provider value={shell}>
      <LiveMessagesContext.Provider value={messages}>
      <SectionDragProvider>
        <Workbench setupNeeded={settings.data?.setupNeeded} />
      </SectionDragProvider>
      {/* Route pages only translate old URLs into tabs and render nothing. */}
      {children}

      {creating && (
        <NewAgentDialog
          draft={draft}
          onClose={() => setCreating(false)}
          onCreated={(tab) => {
            setCreating(false);
            if (tab.kind === "session") onAgentCreated.current?.(tab.agentId);
            onAgentCreated.current = undefined;
            workbench.open(tab);
          }}
        />
      )}
      {palette !== undefined && (
        <CommandPalette initialMode={palette.mode} initialQuery={palette.query} onClose={() => setPalette(undefined)} />
      )}
      {help && <ShortcutHelp onClose={() => setHelp(false)} />}
      {feedback && <FeedbackFlow onClose={() => setFeedback(false)} />}
      <NoticeStack />
      <TooltipLayer />
      </LiveMessagesContext.Provider>
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
  // Here, not only in Settings, so an auto theme follows the system wherever you are.
  useTheme();
  return (
    <CommandProvider>
      <WorkbenchProvider>
        <ShellBody>{children}</ShellBody>
      </WorkbenchProvider>
    </CommandProvider>
  );
}
