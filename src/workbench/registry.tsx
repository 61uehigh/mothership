"use client";

import {
  Bot,
  CalendarDays,
  Container,
  FileCode2,
  FileDiff,
  FileText,
  GitCompare,
  GitPullRequest,
  Inbox,
  LayoutGrid,
  MessageSquare,
  Network,
  Settings,
  SquareKanban,
  type LucideIcon,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { ContainerTab } from "@/features/docker/ui/ContainerTab";
import { DockerPane } from "@/features/docker/ui/DockerPane";
import { FileTab } from "@/features/explorer/ui/FileTab";
import { FilesPane } from "@/features/explorer/ui/FilesPane";
import { GitHubPane } from "@/features/github/ui/GitHubPane";
import { PrSide } from "@/features/github/ui/PrSide";
import { PrTab } from "@/features/github/ui/PrTab";
import { InboxView } from "@/features/sessions/ui/questions/InboxView";
import { ChangesView } from "@/features/sessions/ui/review/ChangesView";
import { CompareView } from "@/features/sessions/ui/review/CompareView";
import { GraphTab } from "@/features/sessions/ui/GraphTab";
import { SessionInfo } from "@/features/sessions/ui/SessionInfo";
import { SessionsPane } from "@/features/sessions/ui/SessionsPane";
import { SessionView } from "@/features/sessions/ui/SessionView";
import { SettingsTab } from "@/features/settings/ui/SettingsTab";
import { CalendarPane } from "@/features/tools/calendar/ui/CalendarPane";
import { CalendarView } from "@/features/tools/calendar/ui/CalendarView";
import { DocTab } from "@/features/tools/nuclino/ui/DocTab";
import { EventTab } from "@/features/tools/calendar/ui/EventTab";
import { IssueTab } from "@/features/tools/linear/ui/IssueTab";
import { LinearPane } from "@/features/tools/linear/ui/LinearPane";
import { NuclinoPane } from "@/features/tools/nuclino/ui/NuclinoPane";
import { SlackPane } from "@/features/tools/slack/ui/SlackPane";
import { SlackTab } from "@/features/tools/slack/ui/SlackTab";
import type { BrandIconProps } from "@/ui/brandIcons";
import { SECTION_INFO } from "@/shell/sections";
import type { SectionId, Tab, TabKind } from "@/shell/tabs";
import type { Agent } from "@/features/sessions/model/Agent";

type Context = { agents: Array<Agent> };

type TabEntry<K extends TabKind> = {
  icon: LucideIcon;
  title: (tab: Extract<Tab, { kind: K }>, ctx: Context) => string;
  render: (tab: Extract<Tab, { kind: K }>, ctx: Context) => ReactNode;
  /** Details column beside this tab (folded by default); none when omitted or `undefined`. */
  side?: (tab: Extract<Tab, { kind: K }>, ctx: Context) => ReactNode;
};

function missing(what: string): ReactNode {
  return <p className="p-6 text-sm text-zinc-500">{what} no longer exists.</p>;
}

const agentOf = (ctx: Context, id: string) => ctx.agents.find((a) => a.id === id);
const basename = (path: string) => path.split("/").at(-1) ?? path;

/**
 * ### TABS
 *
 * How each tab kind is titled, drawn in the center, and described in the
 * details column beside it.
 */
export const TABS: { [K in TabKind]: TabEntry<K> } = {
  session: {
    icon: Bot,
    title: (tab, ctx) => agentOf(ctx, tab.agentId)?.name ?? "Session",
    render: (tab, ctx) => {
      const agent = agentOf(ctx, tab.agentId);
      return agent === undefined ? missing("This session") : <SessionView key={agent.id} agent={agent} />;
    },
    side: (tab, ctx) => {
      const agent = agentOf(ctx, tab.agentId);
      return agent === undefined ? undefined : <SessionInfo agent={agent} />;
    },
  },
  changes: {
    icon: FileDiff,
    title: (tab, ctx) => `Changes · ${agentOf(ctx, tab.agentId)?.name ?? "session"}`,
    render: (tab, ctx) => {
      const agent = agentOf(ctx, tab.agentId);
      if (agent?.worktree === undefined) return missing("This worktree");
      return <ChangesView key={agent.id} agent={{ ...agent, worktree: agent.worktree }} />;
    },
    side: (tab, ctx) => {
      const agent = agentOf(ctx, tab.agentId);
      return agent === undefined ? undefined : <SessionInfo agent={agent} />;
    },
  },
  compare: { icon: GitCompare, title: () => "Compare run", render: (tab) => <CompareView key={tab.group} group={tab.group} /> },
  graph: { icon: Network, title: () => "Agent graph", render: () => <GraphTab /> },
  inbox: { icon: Inbox, title: () => "Inbox", render: (tab) => <InboxView focusId={tab.questionId} /> },
  file: { icon: FileCode2, title: (tab) => basename(tab.path), render: (tab) => <FileTab key={`${tab.root}:${tab.path}`} tab={tab} /> },
  pr: {
    icon: GitPullRequest,
    title: (tab) => `#${tab.number} · ${tab.repo.split("/")[1] ?? tab.repo}`,
    render: (tab) => <PrTab key={`${tab.repo}#${tab.number}`} tab={tab} />,
    side: (tab) => <PrSide key={`${tab.repo}#${tab.number}`} tab={tab} />,
  },
  doc: { icon: FileText, title: (tab) => tab.title, render: (tab) => <DocTab key={tab.itemId} tab={tab} /> },
  issue: { icon: SquareKanban, title: (tab) => tab.title, render: (tab) => <IssueTab key={tab.issueId} tab={tab} /> },
  slack: { icon: MessageSquare, title: (tab) => tab.title, render: (tab) => <SlackTab key={tab.url} tab={tab} /> },
  event: { icon: CalendarDays, title: (tab) => tab.title, render: (tab) => <EventTab key={tab.eventId} tab={tab} /> },
  calendar: { icon: CalendarDays, title: () => "Calendar", render: () => <CalendarView /> },
  settings: { icon: Settings, title: () => "Settings", render: () => <SettingsTab /> },
  container: { icon: Container, title: (tab) => tab.name, render: (tab) => <ContainerTab key={tab.id} tab={tab} /> },
  section: {
    icon: LayoutGrid,
    title: (tab) => SECTION_ENTRIES[tab.section].label,
    render: (tab) => SECTION_ENTRIES[tab.section].pane(),
  },
};

/**
 * ### tabEntry
 *
 * Typed lookup into {@link TABS} for a concrete tab.
 */
export function tabEntry<T extends Tab>(tab: T): TabEntry<T["kind"]> {
  // The mapped type guarantees TABS[tab.kind] matches tab.kind.
  return TABS[tab.kind] as unknown as TabEntry<T["kind"]>;
}

/**
 * ### SECTION_ENTRIES
 *
 * Icon, label (see `SECTION_INFO`), and list pane for each section.
 */
export const SECTION_ENTRIES: Record<SectionId, { icon: ComponentType<BrandIconProps>; label: string; pane: () => ReactNode }> = {
  sessions: { ...SECTION_INFO.sessions, pane: () => <SessionsPane /> },
  files: { ...SECTION_INFO.files, pane: () => <FilesPane /> },
  github: { ...SECTION_INFO.github, pane: () => <GitHubPane /> },
  docker: { ...SECTION_INFO.docker, pane: () => <DockerPane /> },
  nuclino: { ...SECTION_INFO.nuclino, pane: () => <NuclinoPane /> },
  linear: { ...SECTION_INFO.linear, pane: () => <LinearPane /> },
  slack: { ...SECTION_INFO.slack, pane: () => <SlackPane /> },
  calendar: { ...SECTION_INFO.calendar, pane: () => <CalendarPane /> },
};
