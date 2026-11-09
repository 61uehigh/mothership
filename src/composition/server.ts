import { existsSync } from "node:fs";
import { mkdir, open, writeFile } from "node:fs/promises";
import path from "node:path";
import { checkDocker } from "@/features/docker/server/cli";
import { FileService } from "@/features/explorer/server/FileService";
import { checkGitHubCli } from "@/features/github/server/gh";
import { AgentRuntime } from "@/features/sessions/server/AgentRuntime";
import { AgentStore } from "@/features/sessions/server/AgentStore";
import { checkProviders } from "@/features/sessions/server/providerChecks";
import { isConnectionId, type ConnectionId, type ConnectionTest } from "@/features/settings/model/Settings";
import { SettingsService, type SidebarState } from "@/features/settings/server/settingsService";
import { readSettings } from "@/features/settings/server/settingsStore";
import { TOOL_KINDS, type ToolKind } from "@/features/tools/model/Dashboard";
import { loadDashboardConfig, type DashboardConfig } from "@/features/tools/server/DashboardConfig";
import { DashboardService, type WidgetResults } from "@/features/tools/server/DashboardService";
import { DETAIL_PREFIXES, DetailCache } from "@/features/tools/server/detailCache";
import { slackUserId } from "@/features/tools/slack/server/slackSource";
import { TOOL_SOURCES } from "@/features/tools/server/toolSources";
import { UsageTracker } from "@/features/usage/server/UsageTracker";
import { connectorCaller } from "@/platform/mcp/ClaudeConnectorRelay";
import { McpClientPool } from "@/platform/mcp/McpClientPool";
import { loadMcpConfig, type McpConfig } from "@/platform/mcp/McpRegistry";
import type { ToolCaller } from "@/platform/mcp/ToolCaller";
import { appPath, dataPath, workspaceDir } from "@/platform/paths";
import { UsageLog } from "@/features/insights/server/UsageLog";
import type { InboxView } from "@/features/inbox/model/Inbox";
import { buildInbox, type InboxInputs } from "@/features/inbox/server/buildInbox";
import { readInboxReview, reviewInbox } from "@/features/inbox/server/inboxReview";
import { getAllOverview, getPullRequest, getPullRequestDiff, myPrStatuses } from "@/features/github/server/GitHub";
import type { PrSummary, PrSummaryView } from "@/features/github/model/PrSummary";
import { summarizePullRequest } from "@/features/github/server/prSummary";
import type { DebugInfo, FeedbackInput } from "@/features/feedback/model/Feedback";
import { feedbackBrief, feedbackTitle } from "@/features/feedback/server/feedbackBrief";
import type { Agent } from "@/features/sessions/model/Agent";
import type { MeetingsView, MeetingSummary, MeetingSummaryView, NuclinoCollectionChoice } from "@/features/meetings/model/Meetings";
import { summarizeMeeting } from "@/features/meetings/server/meetingSummary";
import { listMeetingNotes, listNuclinoCollections, readMeetingNote } from "@/features/tools/nuclino/server/nuclinoMeetings";
import { nuclinoUrl } from "@/features/tools/nuclino/server/nuclinoSource";
import { SummaryStore } from "@/platform/summaryStore";
import { TodoStore } from "@/features/todos/server/TodoStore";
import { runningCheckout } from "@/platform/checkout";
import { runGit } from "@/platform/git";
import { HttpError } from "@/platform/http/HttpError";

/**
 * Everything that holds state. Kept on `globalThis` because each route can
 * load its own copy of this module and a dev reload loads a new one; they
 * must all share one runtime, one set of MCP connections, and one cache.
 */
type State = {
  /** Claude's Inbox review in progress, so only one runs at a time. */
  /** `attemptedDay`: the day the automatic review last ran, so a failing one is not retried on every load. */
  inbox: { reviewing: Promise<void> | undefined; lastReviewError: string | undefined; attemptedDay: string | undefined };
  usage: UsageTracker;
  usageLog: UsageLog;
  pool: McpClientPool;
  runtime: AgentRuntime;
  widgetResults: WidgetResults;
  details: DetailCache;
  /** Made on first use, so a server running from before to-dos existed gets one after a hot reload. */
  todos?: TodoStore;
};

// Widening only: adds our optional slot to `globalThis`, which is otherwise untyped for it.
const globalRef = globalThis as typeof globalThis & { __mothership?: State };

/** A custom MCP config (demo mode) names made-up tools, so your Settings choices don't apply to it. */
const usesCustomConfig = () => Boolean(process.env.MOTHERSHIP_MCP_CONFIG);

/**
 * ### mcpConfig
 *
 * @returns The MCP config with your Settings choices applied.
 */
export async function mcpConfig(): Promise<McpConfig> {
  return loadMcpConfig(usesCustomConfig() ? {} : (await readSettings()).connections);
}

/**
 * ### dashboardConfig
 *
 * @returns The sidebar config with your Settings choices applied.
 */
export async function dashboardConfig(): Promise<DashboardConfig> {
  const { connections, profile } = await readSettings();
  return loadDashboardConfig({ connections: usesCustomConfig() ? {} : connections, profile });
}

/**
 * ### defaultFolder
 *
 * @returns The folder a new session works in when you leave its folder empty:
 *   your choice in Settings, else `MOTHERSHIP_WORKSPACE`, else your home folder.
 */
export async function defaultFolder(): Promise<string> {
  return (await readSettings()).defaultFolder ?? workspaceDir();
}

function state(): State {
  if (globalRef.__mothership === undefined) {
    // The desktop app runs this server with Electron's binary as Node. Agents, git, and other
    // programs started from here should see an ordinary environment, so the switch stops here
    // (the control MCP server, which also runs Electron's binary, sets it again for itself).
    delete process.env.ELECTRON_RUN_AS_NODE;
    const usage = new UsageTracker();
    const onRateLimit = (info: unknown) => usage.recordClaude(info);
    const runtime = new AgentRuntime({
      store: new AgentStore(dataPath(".mothership", "mothership.db")),
      defaultFolder,
      worktreesDir: dataPath(".mothership", "worktrees"),
      // `||` on purpose: the .env template leaves this as an empty string.
      baseUrl: process.env.MOTHERSHIP_BASE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`,
      environment: { mcpConfig, onRateLimit, controlScript: appPath("scripts", "control-mcp.mjs") },
    });
    globalRef.__mothership = {
      inbox: { reviewing: undefined, lastReviewError: undefined, attemptedDay: undefined },
      usage,
      usageLog: new UsageLog(dataPath(".mothership", "usage.db")),
      pool: new McpClientPool(),
      runtime,
      widgetResults: { cache: new Map(), inflight: new Map() },
      details: new DetailCache(),
    };
  }
  return globalRef.__mothership;
}

/**
 * ### getRuntime
 *
 * @returns The agent runtime: sessions, turns, worktrees, and questions.
 */
export function getRuntime(): AgentRuntime {
  return state().runtime;
}

/** Where the server log is: the desktop app's, else `pnpm autostart`'s. */
const SERVER_LOGS = () => [dataPath("logs", "server.log"), dataPath(".mothership", "server.log")];
const LOG_TAIL_BYTES = 64 * 1024;

/**
 * ### serverLogTail
 *
 * @returns The last `count` lines of the server log, or none when there is no log file.
 */
export async function serverLogTail(count: number): Promise<Array<string>> {
  const file = SERVER_LOGS().find((candidate) => existsSync(candidate));
  if (file === undefined) return [];
  const handle = await open(file, "r");
  try {
    const { size } = await handle.stat();
    const start = Math.max(0, size - LOG_TAIL_BYTES);
    const buffer = Buffer.alloc(size - start);
    await handle.read(buffer, 0, buffer.length, start);
    return buffer.toString("utf8").split("\n").filter((line) => line.trim() !== "").slice(-count);
  } finally {
    await handle.close();
  }
}

/**
 * ### developerSource
 *
 * @returns The mothership checkout feedback works on, when developer mode is on.
 * @throws {@link HttpError} 409 when developer mode is off or no checkout is known.
 */
export async function developerSource(): Promise<string> {
  const { developer } = await readSettings();
  const source = developer.sourceFolder ?? runningCheckout();
  if (!developer.enabled) throw new HttpError("Developer mode is off. Turn it on in Settings → Developer.", 409);
  if (source === undefined) throw new HttpError("Choose mothership's source folder in Settings → Developer.", 409);
  return source;
}

/**
 * ### submitFeedback
 *
 * Turns feedback on mothership's screen into a lead session that changes
 * mothership's own code in a worktree of the source folder, with the
 * screenshot, the page's errors, and the server log attached. You review and
 * merge its changes as with any session.
 *
 * @returns The new session.
 * @throws {@link HttpError} 409 when developer mode is not set up.
 */
export async function submitFeedback(input: FeedbackInput): Promise<Agent> {
  const source = await developerSource();
  let screenshotPath: string | undefined;
  if (input.screenshot !== undefined) {
    const folder = dataPath(".mothership", "feedback");
    await mkdir(folder, { recursive: true });
    screenshotPath = path.join(folder, `${new Date().toISOString().replace(/[:.]/g, "-")}.png`);
    await writeFile(screenshotPath, Buffer.from(input.screenshot.slice(input.screenshot.indexOf(",") + 1), "base64"));
  }
  const [logTail, commit] = await Promise.all([
    serverLogTail(60),
    runGit(source, ["log", "-1", "--format=%h %s"]).then((line) => line.trim(), () => undefined),
  ]);
  return getRuntime().createAgent({
    name: feedbackTitle(input.text),
    role: "lead",
    provider: "claude",
    model: undefined,
    effort: "high",
    parentId: undefined,
    // Its own code is all it needs; no work tools.
    mcp: [],
    initialMessage: feedbackBrief(input, { screenshotPath, commit, logTail }),
    repo: source,
    worktree: true,
    compareGroup: undefined,
  });
}

/**
 * ### debugInfo
 *
 * @returns How this server runs, the source checkout's state, and the end of the server log.
 */
export async function debugInfo(): Promise<DebugInfo> {
  const { developer } = await readSettings();
  const source = developer.sourceFolder ?? runningCheckout();
  const git = (args: Array<string>) => (source === undefined ? Promise.resolve(undefined) : runGit(source, args).then((out) => out.trim(), () => undefined));
  const [branch, commit, status, log] = await Promise.all([
    git(["rev-parse", "--abbrev-ref", "HEAD"]),
    git(["log", "-1", "--format=%h %s"]),
    git(["status", "--porcelain"]),
    serverLogTail(200),
  ]);
  return {
    packaged: process.env.MOTHERSHIP_DATA_DIR !== undefined,
    dataDir: dataPath(),
    node: process.version,
    developer: {
      enabled: developer.enabled,
      source,
      branch,
      commit,
      changedFiles: status === undefined ? undefined : status.split("\n").filter((line) => line !== "").length,
    },
    log,
  };
}

/** Your local date on this Mac, `YYYY-MM-DD`. */
const localToday = () => new Date().toLocaleDateString("sv-SE");

async function inboxInputs(refresh: boolean): Promise<InboxInputs> {
  const dashboard = getDashboard();
  const { agents, questions } = getRuntime().snapshot();
  const [slack, linear, github] = await Promise.all([
    dashboard.loadKind("slack", refresh),
    dashboard.loadKind("linear", refresh),
    Promise.all([getAllOverview(refresh), myPrStatuses(refresh)]).then(
      ([overview, statuses]) => ({ overview, statuses }),
      (error: unknown) => (error instanceof Error ? error : new Error(String(error))),
    ),
  ]);
  return { questions, agentNames: new Map(agents.map((a) => [a.id, a.name])), slack, linear, github };
}

/**
 * ### loadInbox
 *
 * Gathers what needs you from agents, GitHub, Slack, and Linear, sorted by
 * your rules and today's Claude review. With the review on and none done
 * today, starts one in the background; the next load shows its moves.
 *
 * @param refresh - Load every source fresh instead of from the sidebar's cache.
 */
export async function loadInbox(refresh: boolean): Promise<InboxView> {
  const today = localToday();
  const [{ inbox: rules }, inputs, review] = await Promise.all([readSettings(), inboxInputs(refresh), readInboxReview()]);
  const current = review?.day === today ? review : undefined;
  const view = buildInbox(inputs, rules, current?.moves ?? {}, Date.now(), today);
  const inbox = state().inbox;
  if (rules.claudeReview && current === undefined && inbox.attemptedDay !== today && inbox.reviewing === undefined && view.items.length > 0) {
    inbox.attemptedDay = today;
    // As the rules sorted them: an older review's moves are not today's.
    const ruled = buildInbox(inputs, rules, {}, Date.now(), today);
    inbox.lastReviewError = undefined;
    inbox.reviewing = reviewInbox(ruled.items, today)
      .catch((error: unknown) => {
        inbox.lastReviewError = error instanceof Error ? error.message : String(error);
        console.error(`[inbox] Claude review failed: ${inbox.lastReviewError}`);
      })
      .finally(() => {
        inbox.reviewing = undefined;
      })
      .then(() => undefined);
  }
  return { ...view, reviewedAt: current?.at, reviewing: inbox.reviewing !== undefined, reviewError: current === undefined ? inbox.lastReviewError : undefined };
}

/**
 * ### reviewInboxNow
 *
 * Runs Claude's review now (even if one ran today) and returns the Inbox with its moves.
 *
 * @throws Error When Claude's review fails.
 */
export async function reviewInboxNow(): Promise<InboxView> {
  const today = localToday();
  const [{ inbox: rules }, inputs] = await Promise.all([readSettings(), inboxInputs(false)]);
  const ruled = buildInbox(inputs, rules, {}, Date.now(), today);
  const review = await reviewInbox(ruled.items, today);
  state().inbox.lastReviewError = undefined;
  return { ...buildInbox(inputs, rules, review.moves, Date.now(), today), reviewedAt: review.at, reviewing: false, reviewError: undefined };
}

const meetingSummaries = new SummaryStore<MeetingSummary>("meeting-summaries");
/** Summaries being made, by note id, so a second click waits for the first. */
const summarizing = new Map<string, Promise<MeetingSummaryView>>();

const versionOf = (updatedAt: number | undefined) => String(updatedAt ?? 0);

/** Runs `run` with the Nuclino caller; a tool failure becomes an error to throw. */
async function withNuclino<T>(run: (caller: ToolCaller) => Promise<T>): Promise<T> {
  const outcome = await getDashboard().callTool("nuclino", run);
  if (outcome.status === "ok") return outcome.value;
  throw outcome.status === "unavailable" ? new HttpError(outcome.reason, 409) : new HttpError(outcome.message, outcome.notFound ? 404 : 502);
}

/**
 * ### loadMeetings
 *
 * The newest notes in each collection you chose in Settings → Meetings.
 * A collection that fails to load says why; the others still show.
 *
 * @param refresh - Read the collections fresh, so new notes show; notes already read come from the cache.
 */
export async function loadMeetings(refresh: boolean): Promise<MeetingsView> {
  const { meetings } = await readSettings();
  const collections = await Promise.all(
    meetings.collections.map(async (collection) => {
      const saved = new Map<string, boolean>();
      try {
        const notes = await withNuclino(async (caller) => {
          const listed = await listMeetingNotes(caller, collection, () => false, refresh);
          await Promise.all(listed.map(async (note) => saved.set(note.id, await meetingSummaries.has(note.id, versionOf(note.updatedAt)))));
          return listed.map((note) => ({ ...note, summarized: saved.get(note.id) ?? false }));
        });
        return { ...collection, notes, error: undefined };
      } catch (error) {
        return { ...collection, notes: [], error: error instanceof Error ? error.message : String(error) };
      }
    }),
  );
  return { collections };
}

/**
 * ### meetingCollectionChoices
 *
 * Collections to choose from in Settings → Meetings, one level at a time.
 *
 * @param parentId - A workspace or collection id; `undefined` lists the workspaces.
 * @throws HttpError 409 when Nuclino is not set up, 502 when the call fails.
 */
export function meetingCollectionChoices(parentId: string | undefined, path: Array<string>): Promise<Array<NuclinoCollectionChoice & { kind: "workspace" | "collection" }>> {
  return withNuclino((caller) => listNuclinoCollections(caller, parentId, path));
}

/**
 * ### meetingSummary
 *
 * Claude's summary of a meeting note: the saved one when the note has not
 * changed since, otherwise a new one (which takes a while).
 *
 * @param fresh - Make a new summary even if one is saved.
 * @throws HttpError When Nuclino fails; Error when Claude does.
 */
export function meetingSummary(itemId: string, fresh: boolean): Promise<MeetingSummaryView> {
  const running = summarizing.get(itemId);
  if (running !== undefined) return running;
  const made = (async (): Promise<MeetingSummaryView> => {
    const note = await withNuclino((caller) => readMeetingNote(caller, itemId));
    const version = versionOf(note.updatedAt);
    const base = { id: itemId, title: note.title, url: nuclinoUrl(itemId), updatedAt: note.updatedAt };
    const saved = fresh ? undefined : await meetingSummaries.get(itemId, version);
    if (saved !== undefined) return { ...base, summary: saved.value, summarizedAt: saved.at };
    if (note.markdown.trim() === "") throw new HttpError("This note is empty, so there is nothing to summarize.", 422);
    const summary = await summarizeMeeting(note, localToday());
    return { ...base, summary, summarizedAt: await meetingSummaries.set(itemId, version, summary) };
  })().finally(() => summarizing.delete(itemId));
  summarizing.set(itemId, made);
  return made;
}

// v2: the shorter summary (gist, key changes, where to look); summaries in the older, longer shape are made again.
const prSummaries = new SummaryStore<{ summary: PrSummary; truncated: boolean }>("pr-summaries-v2");
const summarizingPrs = new Map<string, Promise<PrSummaryView>>();

/**
 * ### pullRequestSummary
 *
 * Claude's review-oriented summary of a pull request: the saved one for its
 * current head commit, otherwise a new one (which takes a while).
 *
 * @param fresh - Make a new summary even if one is saved.
 * @throws GhError When `gh` fails; Error when Claude does.
 */
export function pullRequestSummary(repo: string, number: number, fresh: boolean): Promise<PrSummaryView> {
  const key = `${repo}#${number}`;
  const running = summarizingPrs.get(key);
  if (running !== undefined) return running;
  const made = (async (): Promise<PrSummaryView> => {
    const pr = await getPullRequest(repo, number);
    const saved = fresh ? undefined : await prSummaries.get(key, pr.headRefOid);
    if (saved !== undefined) return { ...saved.value, headRefOid: pr.headRefOid, summarizedAt: saved.at };
    const result = await summarizePullRequest(pr, await getPullRequestDiff(repo, number));
    return { ...result, headRefOid: pr.headRefOid, summarizedAt: await prSummaries.set(key, pr.headRefOid, result) };
  })().finally(() => summarizingPrs.delete(key));
  summarizingPrs.set(key, made);
  return made;
}

/**
 * ### getUsageLog
 *
 * @returns Your own use of the app (features, entry paths, active time), for Insights.
 */
export function getUsageLog(): UsageLog {
  return state().usageLog;
}

/**
 * ### getUsageTracker
 *
 * @returns Claude and Codex usage limits and this Mac's load.
 */
export function getUsageTracker(): UsageTracker {
  return state().usage;
}

/**
 * ### getTodos
 *
 * @returns Your to-do list.
 */
export function getTodos(): TodoStore {
  const current = state();
  current.todos ??= new TodoStore(dataPath(".mothership", "todos.json"));
  return current.todos;
}

/**
 * ### getDetailCache
 *
 * @returns The cache of tool detail views (threads, events).
 */
export function getDetailCache(): DetailCache {
  return state().details;
}

function connector(name: string): ToolCaller {
  const { usage } = state();
  return connectorCaller(name, { onRateLimit: (info) => usage.recordClaude(info) });
}

/**
 * ### getDashboard
 *
 * @returns The sidebar's work-tool widgets and the search across tools.
 */
export function getDashboard(): DashboardService {
  const { pool, widgetResults } = state();
  return new DashboardService({
    sources: TOOL_SOURCES,
    loadConfig: dashboardConfig,
    mcpConfig,
    mcpCaller: (server) => pool.caller(server),
    connectorCaller: connector,
    results: widgetResults,
  });
}

/**
 * ### forgetAfterWrite
 *
 * After a successful change made from mothership (a sent message, a
 * reaction, an RSVP): drops the tool's cached details and its widgets'
 * cached results, so both show the change.
 */
export async function forgetAfterWrite(kind: keyof typeof DETAIL_PREFIXES & ToolKind): Promise<void> {
  getDetailCache().forget(DETAIL_PREFIXES[kind]);
  await getDashboard().invalidate(kind);
}

/**
 * ### afterSettingsChange
 *
 * After a change in Settings (a connection, a token, your profile): drops
 * cached widget results and details, which may come from the old source or
 * settings, and closes MCP connections that are no longer used.
 */
export async function afterSettingsChange(): Promise<void> {
  getDetailCache().forget("");
  await Promise.all(TOOL_KINDS.map((kind) => getDashboard().invalidate(kind)));
  const { servers } = await mcpConfig().catch(() => ({ servers: [] }));
  await state().pool.retain(new Set(servers.map((s) => s.name)));
}

/**
 * ### getFiles
 *
 * @returns The Explorer's file service; a session root is that session's folder.
 */
export function getFiles(): FileService {
  const { runtime } = state();
  return new FileService({ workspace: defaultFolder, sessionFolder: (id) => runtime.detail(id)?.agent.workingDirectory });
}

/**
 * ### sessionFolders
 *
 * @returns Each session's repository (or working folder), for finding local GitHub repositories.
 */
export function sessionFolders(): Array<string> {
  return getRuntime()
    .snapshot()
    .agents.map((agent) => agent.worktree?.repo ?? agent.workingDirectory);
}

async function sidebarState(): Promise<SidebarState> {
  const config = await dashboardConfig();
  const widgets: SidebarState["widgets"] = {};
  for (const widget of config.widgets) {
    if (!("server" in widget) || !isConnectionId(widget.server)) continue;
    widgets[widget.server] ??= { via: widget.via, disabled: widget.disabled };
  }
  return { widgets, profile: { names: config.me.names, slackUserId: slackUserId(config), timezone: config.timezone } };
}

async function testConnection(id: ConnectionId): Promise<ConnectionTest> {
  const result = await getDashboard().loadBySource(id);
  if (result === undefined) return { ok: false, message: `No sidebar section uses ${id}; add one to config/dashboard.yaml.` };
  switch (result.status) {
    case "ok":
      return { ok: true, items: result.items.length };
    case "unavailable":
      return { ok: false, message: result.reason };
    case "error":
      return { ok: false, message: result.message };
  }
}

/**
 * ### getSettings
 *
 * @returns The Settings screen's service.
 */
export function getSettings(): SettingsService {
  return new SettingsService({
    agents: checkProviders,
    tools: { github: checkGitHubCli, docker: checkDocker },
    sidebar: sidebarState,
    test: testConnection,
  });
}
