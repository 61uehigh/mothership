"use client";

import {
  BarChart3,
  Bug,
  Bot,
  CalendarDays,
  Container,
  FileCode2,
  FileDiff,
  FileText,
  GitCompare,
  GitPullRequest,
  Gauge,
  Laptop,
  MessageCircleQuestion,
  LayoutGrid,
  Mail,
  MessageSquare,
  Network,
  NotebookPen,
  NotebookText,
  Settings,
  SquareKanban,
  ListTodo,
  CalendarCheck,
  type LucideIcon,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { itemTitle } from "@/ui/i18n/itemTitle";
import { ContainerTab } from "@/features/docker/ui/ContainerTab";
import { DockerPane } from "@/features/docker/ui/DockerPane";
import { FileTab } from "@/features/explorer/ui/FileTab";
import { FilesPane } from "@/features/explorer/ui/FilesPane";
import { GitHubPane } from "@/features/github/ui/GitHubPane";
import { PrSide } from "@/features/github/ui/PrSide";
import { PrTab } from "@/features/github/ui/PrTab";
import { QuestionsView } from "@/features/sessions/ui/questions/QuestionsView";
import { ChangesView } from "@/features/sessions/ui/review/ChangesView";
import { CompareView } from "@/features/sessions/ui/review/CompareView";
import { GraphTab } from "@/features/sessions/ui/GraphTab";
import { SessionInfo } from "@/features/sessions/ui/SessionInfo";
import { SessionsPane } from "@/features/sessions/ui/SessionsPane";
import { SessionView } from "@/features/sessions/ui/SessionView";
import { SystemTab } from "@/features/usage/ui/SystemTab";
import { AgentLimitsTab } from "@/features/usage/ui/AgentLimitsTab";
import { SettingsTab } from "@/features/settings/ui/SettingsTab";
import { CalendarPane } from "@/features/tools/calendar/ui/CalendarPane";
import { CalendarView } from "@/features/tools/calendar/ui/CalendarView";
import { NuclinoDocTab } from "@/features/tools/nuclino/ui/NuclinoDocTab";
import { MeetingTab } from "@/features/meetings/ui/MeetingTab";
import { MeetingsPane } from "@/features/meetings/ui/MeetingsPane";
import { TodoPane } from "@/features/todos/ui/TodoPane";
import { TodoTab } from "@/features/todos/ui/TodoTab";
import { DailyTab } from "@/features/todos/ui/DailyTab";
import { EventTab } from "@/features/tools/calendar/ui/EventTab";
import { IssueTab } from "@/features/tools/linear/ui/IssueTab";
import { LinearPane } from "@/features/tools/linear/ui/LinearPane";
import { NuclinoPane } from "@/features/tools/nuclino/ui/NuclinoPane";
import { NotionPane } from "@/features/tools/notion/ui/NotionPane";
import { NotionPageTab } from "@/features/tools/notion/ui/NotionPageTab";
import { SlackPane } from "@/features/tools/slack/ui/SlackPane";
import { SlackTab } from "@/features/tools/slack/ui/SlackTab";
import { YouTubeMusicPane } from "@/features/youtube-music/ui/YouTubeMusicPane";
import type { BrandIconProps } from "@/ui/brandIcons";
import { SECTION_INFO, sectionLabel } from "@/shell/sections";
import { todoTabTitle } from "@/shell/todos";
import type { Translate } from "@/ui/i18n/translate";
import type { SectionId, Tab, TabKind } from "@/shell/tabs";
import type { Agent } from "@/features/sessions/model/Agent";
import { InsightsTab } from "@/features/insights/ui/InsightsTab";
import { DebugTab } from "@/features/feedback/ui/DebugTab";
import { InboxPane } from "@/features/inbox/ui/InboxPane";
import { KakaoTalkPane } from "@/features/kakaotalk/ui/KakaoTalkPane";
import { GmailPane } from "@/features/gmail/ui/GmailPane";
import { MailTab } from "@/features/gmail/ui/MailTab";

type Context = { agents: Array<Agent>; t: Translate };

type TabEntry<K extends TabKind> = {
  icon: LucideIcon;
  title: (tab: Extract<Tab, { kind: K }>, ctx: Context) => string;
  render: (tab: Extract<Tab, { kind: K }>, ctx: Context) => ReactNode;
  /** Details column beside this tab (folded by default); none when omitted or `undefined`. */
  side?: (tab: Extract<Tab, { kind: K }>, ctx: Context) => ReactNode;
};

function missing(text: string): ReactNode {
  return <p className="p-6 text-sm text-zinc-500">{text}</p>;
}

const agentOf = (ctx: Context, id: string) => ctx.agents.find((a) => a.id === id);
const basename = (path: string) => path.split(/[\\/]/).at(-1) ?? path;

/**
 * ### TABS
 *
 * How each tab kind is titled, drawn in the center, and described in the
 * details column beside it.
 */
export const TABS: { [K in TabKind]: TabEntry<K> } = {
  session: {
    icon: Bot,
    title: (tab, ctx) => agentOf(ctx, tab.agentId)?.name ?? ctx.t("tab.session"),
    render: (tab, ctx) => {
      const agent = agentOf(ctx, tab.agentId);
      return agent === undefined ? missing(ctx.t("tab.sessionGone")) : <SessionView key={agent.id} agent={agent} />;
    },
    side: (tab, ctx) => {
      const agent = agentOf(ctx, tab.agentId);
      return agent === undefined ? undefined : <SessionInfo key={agent.id} agent={agent} />;
    },
  },
  changes: {
    icon: FileDiff,
    title: (tab, ctx) => ctx.t("tab.changes", { name: agentOf(ctx, tab.agentId)?.name ?? ctx.t("tab.session") }),
    render: (tab, ctx) => {
      const agent = agentOf(ctx, tab.agentId);
      if (agent?.worktree === undefined) return missing(ctx.t("tab.worktreeGone"));
      return <ChangesView key={agent.id} agent={{ ...agent, worktree: agent.worktree }} />;
    },
    side: (tab, ctx) => {
      const agent = agentOf(ctx, tab.agentId);
      return agent === undefined ? undefined : <SessionInfo key={agent.id} agent={agent} />;
    },
  },
  compare: { icon: GitCompare, title: (_, ctx) => ctx.t("tab.compare"), render: (tab) => <CompareView key={tab.group} group={tab.group} /> },
  graph: { icon: Network, title: (_, ctx) => ctx.t("tab.graph"), render: () => <GraphTab /> },
  inbox: { icon: MessageCircleQuestion, title: (_, ctx) => ctx.t("tab.questions"), render: (tab) => <QuestionsView focusId={tab.questionId} /> },
  file: { icon: FileCode2, title: (tab) => basename(tab.path), render: (tab) => <FileTab key={`${tab.root}:${tab.path}`} tab={tab} /> },
  pr: {
    icon: GitPullRequest,
    title: (tab) => `#${tab.number} · ${tab.repo.split("/")[1] ?? tab.repo}`,
    render: (tab) => <PrTab key={`${tab.repo}#${tab.number}`} tab={tab} />,
    side: (tab) => <PrSide key={`${tab.repo}#${tab.number}`} tab={tab} />,
  },
  doc: { icon: FileText, title: (tab, ctx) => tab.title || ctx.t("tab.nuclinoDoc"), render: (tab) => <NuclinoDocTab key={tab.itemId} tab={tab} /> },
  notion: { icon: NotebookText, title: (tab, ctx) => tab.title || ctx.t("tab.notionPage"), render: (tab) => <NotionPageTab key={tab.pageId} tab={tab} /> },
  meeting: { icon: NotebookPen, title: (tab, ctx) => itemTitle(ctx.t, tab.title), render: (tab) => <MeetingTab key={tab.itemId} tab={tab} /> },
  todo: { icon: ListTodo, title: (tab, ctx) => todoTabTitle(tab, ctx.t), render: (tab) => <TodoTab key={tab.todoId} tab={tab} /> },
  issue: { icon: SquareKanban, title: (tab, ctx) => itemTitle(ctx.t, tab.title), render: (tab) => <IssueTab key={tab.issueId} tab={tab} /> },
  slack: { icon: MessageSquare, title: (tab, ctx) => itemTitle(ctx.t, tab.title), render: (tab) => <SlackTab key={tab.url} tab={tab} /> },
  event: { icon: CalendarDays, title: (tab, ctx) => itemTitle(ctx.t, tab.title), render: (tab) => <EventTab key={tab.eventId} tab={tab} /> },
  mail: { icon: Mail, title: (tab, ctx) => itemTitle(ctx.t, tab.title), render: (tab) => <MailTab key={tab.messageId} tab={tab} /> },
  calendar: { icon: CalendarDays, title: (_, ctx) => ctx.t("section.calendar"), render: () => <CalendarView /> },
  daily: { icon: CalendarCheck, title: (_, ctx) => ctx.t("tab.daily"), render: () => <DailyTab /> },
  settings: { icon: Settings, title: (_, ctx) => ctx.t("tab.settings"), render: () => <SettingsTab /> },
  "agent-limits": { icon: Gauge, title: (_, ctx) => ctx.t("tab.agentLimits"), render: () => <AgentLimitsTab /> },
  system: { icon: Laptop, title: (_, ctx) => ctx.t("tab.system"), render: () => <SystemTab /> },
  insights: { icon: BarChart3, title: (_, ctx) => ctx.t("tab.insights"), render: () => <InsightsTab /> },
  debug: { icon: Bug, title: (_, ctx) => ctx.t("tab.debug"), render: () => <DebugTab /> },
  container: { icon: Container, title: (tab) => tab.name, render: (tab) => <ContainerTab key={tab.id} tab={tab} /> },
  section: {
    icon: LayoutGrid,
    title: (tab, ctx) => sectionLabel(ctx.t, tab.section),
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
 * Icon (see `SECTION_INFO`) and list pane for each section; the name comes
 * from `sectionLabel`.
 */
export const SECTION_ENTRIES: Record<SectionId, { icon: ComponentType<BrandIconProps>; pane: () => ReactNode }> = {
  sessions: { ...SECTION_INFO.sessions, pane: () => <SessionsPane /> },
  files: { ...SECTION_INFO.files, pane: () => <FilesPane /> },
  github: { ...SECTION_INFO.github, pane: () => <GitHubPane /> },
  docker: { ...SECTION_INFO.docker, pane: () => <DockerPane /> },
  nuclino: { ...SECTION_INFO.nuclino, pane: () => <NuclinoPane /> },
  notion: { ...SECTION_INFO.notion, pane: () => <NotionPane /> },
  meetings: { ...SECTION_INFO.meetings, pane: () => <MeetingsPane /> },
  linear: { ...SECTION_INFO.linear, pane: () => <LinearPane /> },
  slack: { ...SECTION_INFO.slack, pane: () => <SlackPane /> },
  calendar: { ...SECTION_INFO.calendar, pane: () => <CalendarPane /> },
  gmail: { ...SECTION_INFO.gmail, pane: () => <GmailPane /> },
  inbox: { ...SECTION_INFO.inbox, pane: () => <InboxPane /> },
  todos: { ...SECTION_INFO.todos, pane: () => <TodoPane /> },
  youtubemusic: { ...SECTION_INFO.youtubemusic, pane: () => <YouTubeMusicPane /> },
  kakaotalk: { ...SECTION_INFO.kakaotalk, pane: () => <KakaoTalkPane /> },
};
