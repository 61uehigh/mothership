import { checkDocker } from "@/features/docker/server/cli";
import { FileService } from "@/features/explorer/server/FileService";
import { checkGitHubCli } from "@/features/github/server/gh";
import { AgentRuntime } from "@/features/sessions/server/AgentRuntime";
import { AgentStore } from "@/features/sessions/server/AgentStore";
import { checkProviders } from "@/features/sessions/server/providerChecks";
import { isConnectionId, kakaoAccountState, youTubeAccountState } from "@/features/settings/model/Settings";
import { SettingsService, type SidebarState } from "@/features/settings/server/SettingsService";
import { readSettings, savedLead } from "@/features/settings/server/settingsStore";
import { GoogleSignIn } from "@/features/settings/server/GoogleSignIn";
import { TOOL_KINDS, type ToolKind } from "@/features/tools/model/Dashboard";
import { loadDashboardConfig, type DashboardConfig } from "@/features/tools/server/DashboardConfig";
import { DashboardService, type WidgetResults } from "@/features/tools/server/DashboardService";
import { DETAIL_PREFIXES, DetailCache, LINEAR_NOTIFICATIONS_KEY } from "@/features/tools/server/DetailCache";
import { slackUserId } from "@/features/tools/slack/server/slackSource";
import { fetchLinearNotifications } from "@/features/tools/linear/server/linearSource";
import { TOOL_SOURCES } from "@/features/tools/server/toolSources";
import { toolValue } from "@/features/tools/server/toolFailure";
import { zonedDate } from "@/features/tools/server/sourceUtils";
import { UsageTracker } from "@/features/usage/server/UsageTracker";
import { SystemMonitor } from "@/features/usage/server/SystemMonitor";
import { connectorCaller } from "@/platform/mcp/ClaudeConnectorRelay";
import { McpClientPool } from "@/platform/mcp/McpClientPool";
import { RateLimitGate } from "@/platform/mcp/RateLimitGate";
import { withCallPurpose } from "@/platform/mcp/callPurpose";
import { ToolCallLedger } from "@/platform/mcp/ToolCallLedger";
import { processState } from "@/platform/processState";
import { loadMcpConfig, type McpConfig } from "@/platform/mcp/mcpConfig";
import type { ToolCaller } from "@/platform/mcp/ToolCaller";
import { appPath, dataPath, workspaceDir } from "@/platform/paths";
import { UsageLog } from "@/features/insights/server/UsageLog";
import type { InboxInputs } from "@/features/inbox/server/buildInbox";
import { InboxService } from "@/features/inbox/server/InboxService";
import { getAllOverview, myPrStatuses } from "@/features/github/server/github";
import { PrSummaryService } from "@/features/github/server/PrSummaryService";
import { FeedbackService } from "@/features/feedback/server/FeedbackService";
import { MeetingsService } from "@/features/meetings/server/MeetingsService";
import { listMeetingNotes, listNuclinoCollections, readMeetingNote, restoreNuclinoItems, saveNuclinoItems } from "@/features/tools/nuclino/server/nuclinoMeetings";
import { nuclinoUrl } from "@/features/tools/nuclino/server/nuclinoSource";
import { TodoStore } from "@/features/todos/server/TodoStore";
import { YouTubeMusicAuth } from "@/features/youtube-music/server/YouTubeMusicAuth";
import { kakaoStatus } from "@/features/kakaotalk/server/kakaoApi";
import { whoAmI } from "@/features/youtube-music/server/youtubeApi";

/**
 * Everything that holds state. Kept on `globalThis` because each route can
 * load its own copy of this module and a dev reload loads a new one; they
 * must all share one runtime, one set of MCP connections, and one cache.
 */
type State = {
  usage: UsageTracker;
  usageLog: UsageLog;
  pool: McpClientPool;
  runtime: AgentRuntime;
  widgetResults: WidgetResults;
  details: DetailCache;
  /** Services made on first use; see {@link shared}. */
  lazy?: Partial<LazyServices>;
};

type LazyServices = {
  todos: TodoStore;
  rateLimits: RateLimitGate;
  toolCalls: ToolCallLedger;
  googleSignIn: GoogleSignIn;
  youtubeMusic: YouTubeMusicAuth;
  inbox: InboxService;
  meetings: MeetingsService;
  prSummaries: PrSummaryService;
  system: SystemMonitor;
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
  const { connections, profile, inbox } = await readSettings();
  // The Inbox's @here / @channel rule decides whether the Slack widget searches for them at all.
  return loadDashboardConfig({ connections: usesCustomConfig() ? {} : connections, profile, slackGroupMentions: inbox.slackGroupMention !== "hidden" });
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
      usage,
      usageLog: new UsageLog(dataPath(".mothership", "usage.db")),
      pool: new McpClientPool(),
      runtime,
      widgetResults: { cache: new Map(), inflight: new Map() },
      details: new DetailCache(),
    };
  }
  const current = globalRef.__mothership;
  // A hot reload of McpClientPool leaves the old instance running the old code; swap in a new one.
  if (!(current.pool instanceof McpClientPool)) {
    // Typed as the new class, but its methods are the old ones; `retain` is on both.
    const stale: Pick<McpClientPool, "retain"> = current.pool;
    void stale.retain(new Set());
    current.pool = new McpClientPool();
  }
  return current;
}

/**
 * The service in `key`, made on first use. A hot reload of its class leaves
 * the old instance running the old code, so one that is no longer an
 * instance of `type` is made again.
 */
function shared<K extends keyof LazyServices>(key: K, type: abstract new (...args: never[]) => LazyServices[K], make: () => LazyServices[K]): LazyServices[K] {
  const lazy = (state().lazy ??= {});
  const current = lazy[key];
  if (current instanceof type) return current;
  const made = make();
  lazy[key] = made;
  return made;
}

/**
 * ### getRuntime
 *
 * @returns The agent runtime: sessions, turns, worktrees, and questions.
 */
export function getRuntime(): AgentRuntime {
  return state().runtime;
}

/**
 * ### getFeedback
 *
 * @returns Developer mode's feedback sessions and debug info.
 */
export function getFeedback(): FeedbackService {
  return new FeedbackService({
    developer: async () => (await readSettings()).developer,
    startSession: async ({ name, initialMessage, repo }) => {
      // Your default lead (Settings → Agents) takes feedback on too.
      const lead = savedLead(await readSettings());
      return getRuntime().createAgent({
        name,
        role: "lead",
        provider: lead.provider,
        model: lead.model,
        effort: lead.effort,
        parentId: undefined,
        // Its own code is all it needs; no work tools.
        mcp: [],
        initialMessage,
        repo,
        worktree: true,
        compareGroup: undefined,
      });
    },
    toolCalls: () => getToolCalls().counts(Date.now() - TOOL_CALLS_WINDOW_MS),
  });
}

/** How far back the debug panel counts work-tool calls. */
const TOOL_CALLS_WINDOW_MS = 10 * 60_000;

/** Today in the dashboard's time zone (Settings → You, else `dashboard.yaml`), `YYYY-MM-DD`: the zone Calendar and Linear use, not the Mac's. */
const zonedToday = async () => zonedDate(Date.now(), (await dashboardConfig()).timezone);

async function inboxInputs(refresh: boolean): Promise<InboxInputs> {
  const dashboard = getDashboard();
  const { agents, questions } = getRuntime().snapshot();
  const [slack, calendar, linear, linearNotifications, github] = await Promise.all([
    dashboard.loadKind("slack", refresh),
    // The same cached week the Calendar sidebar loads: no extra calls.
    dashboard.loadKind("calendar", refresh),
    dashboard.loadKind("linear", refresh),
    // Cached like other details; when Linear is off or the call fails, they are just left out.
    getDetailCache()
      .cached(LINEAR_NOTIFICATIONS_KEY, refresh, () => dashboard.callTool("linear", (caller) => fetchLinearNotifications(caller, Date.now())))
      .then((outcome) => (outcome.status === "ok" ? outcome.value : undefined)),
    Promise.all([getAllOverview(refresh), myPrStatuses(refresh)]).then(
      ([overview, statuses]) => ({ overview, statuses }),
      (error: unknown) => (error instanceof Error ? error : new Error(String(error))),
    ),
  ]);
  return { questions, agentNames: new Map(agents.map((a) => [a.id, a.name])), slack, calendar, linear, linearNotifications, github };
}

/**
 * ### getInbox
 *
 * @returns The Inbox and its daily Claude review.
 */
export function getInbox(): InboxService {
  return shared("inbox", InboxService, () => new InboxService({ rules: async () => (await readSettings()).inbox, inputs: inboxInputs, today: zonedToday }));
}

/** Runs `run` with the Nuclino caller; a tool failure becomes an `HttpError` to throw. */
async function withNuclino<T>(source: string, background: boolean, run: (caller: ToolCaller) => Promise<T>): Promise<T> {
  return toolValue(await getDashboard().callTool("nuclino", run, { purpose: { source, background } }));
}

/** Nuclino items read for the meeting list, so a restart does not read every note again. */
const nuclinoItemsFile = () => dataPath(".mothership", "nuclino-items.json");

/**
 * ### getMeetings
 *
 * @returns The Meetings section: notes from the Nuclino collections you chose, and Claude's summaries.
 */
export function getMeetings(): MeetingsService {
  return shared(
    "meetings",
    MeetingsService,
    () =>
      new MeetingsService({
        source: {
          listNotes: (collection, fresh) => withNuclino("meetings list", !fresh, (caller) => listMeetingNotes(caller, collection, fresh)),
          readNote: (id) => withNuclino("meeting note", false, (caller) => readMeetingNote(caller, id)),
          listCollections: (parentId, path) => withNuclino("meetings settings", false, (caller) => listNuclinoCollections(caller, parentId, path)),
          noteUrl: nuclinoUrl,
          restoreCache: () => restoreNuclinoItems(nuclinoItemsFile()),
          saveCache: () => saveNuclinoItems(nuclinoItemsFile()),
        },
        collections: async () => (await readSettings()).meetings.collections,
        today: zonedToday,
      }),
  );
}

/**
 * ### getPrSummaries
 *
 * @returns Claude's review summaries of pull requests.
 */
export function getPrSummaries(): PrSummaryService {
  return shared("prSummaries", PrSummaryService, () => new PrSummaryService());
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
 * ### getSystemMonitor
 *
 * @returns This computer's CPU, memory, disk, battery, and what it is.
 */
export function getSystemMonitor(): SystemMonitor {
  return shared("system", SystemMonitor, () => new SystemMonitor());
}

/**
 * ### getTodos
 *
 * @returns Your to-do list.
 */
export function getTodos(): TodoStore {
  return shared("todos", TodoStore, () => new TodoStore(dataPath(".mothership", "todos.json")));
}

/**
 * ### getYouTubeMusicAuth
 *
 * @returns Your YouTube sign-in, shared by every YouTube Music route.
 */
export function getYouTubeMusicAuth(): YouTubeMusicAuth {
  return shared("youtubeMusic", YouTubeMusicAuth, () => new YouTubeMusicAuth(dataPath(".mothership", "youtube-music-token.json"), undefined, whoAmI));
}

/**
 * ### getDetailCache
 *
 * @returns The cache of tool detail views (threads, events).
 */
export function getDetailCache(): DetailCache {
  return state().details;
}

/**
 * Nuclino allows 150 API calls a minute per account (as its API clients
 * document it). Agents using the nuclino MCP server spend the same account
 * without passing through here, so mothership keeps to well under half.
 */
const CALL_BUDGETS = { nuclino: { perMinute: 60, burst: 10 } };

/**
 * ### getToolCalls
 *
 * @returns The count of calls the server made to each work tool in the last
 *   hour; a line a minute goes to the server log.
 */
export function getToolCalls(): ToolCallLedger {
  return shared("toolCalls", ToolCallLedger, () => {
    const ledger = new ToolCallLedger();
    const minute = processState("toolCalls.logger", () => ({ timer: undefined as ReturnType<typeof setInterval> | undefined }));
    // A dev reload makes a new ledger; the old timer would log the old one.
    if (minute.timer !== undefined) clearInterval(minute.timer);
    minute.timer = setInterval(() => {
      for (const line of ledger.minuteLines()) console.log(line);
    }, 60_000);
    minute.timer.unref();
    return ledger;
  });
}

/** One for every route, so a tool's rate limit and call budget hold back all of its callers. */
function rateLimits(): RateLimitGate {
  return shared("rateLimits", RateLimitGate, () => new RateLimitGate({ budgets: CALL_BUDGETS, ledger: getToolCalls() }));
}

function connector(name: string): ToolCaller {
  const { usage } = state();
  return rateLimits().wrap(connectorCaller(name, { onRateLimit: (info) => usage.recordClaude(info) }));
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
    mcpCaller: (server) => rateLimits().wrap(pool.caller(server)),
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
export async function forgetAfterWrite(kind: ToolKind): Promise<void> {
  getDetailCache().forget(DETAIL_PREFIXES[kind]);
  // The write already happened: a failure here must not answer an error that would make you send it again.
  await getDashboard()
    .invalidate(kind)
    .catch((error: unknown) => console.warn(`[tools] Could not refresh ${kind} after a write:`, error));
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
 * ### afterGoogleSignOut
 *
 * After the Google Calendar sign-in is removed: closes the Calendar MCP
 * server, which holds the old token in memory, then refreshes like any
 * Settings change, so the sidebar and the Inbox see it signed out.
 */
export async function afterGoogleSignOut(): Promise<void> {
  const { servers } = await mcpConfig().catch(() => ({ servers: [] }));
  await state().pool.retain(new Set(servers.map((s) => s.name).filter((name) => name !== "google_calendar")));
  await afterSettingsChange();
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

/**
 * ### getGoogleSignIn
 *
 * @returns The Google Calendar sign-in Settings runs for you.
 */
export function getGoogleSignIn(): GoogleSignIn {
  return shared("googleSignIn", GoogleSignIn, () => new GoogleSignIn());
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
    loadWidget: (id) => withCallPurpose({ source: "connection test", background: false }, () => getDashboard().loadBySource(id)),
    cachedWidget: (id) => getDashboard().cachedBySource(id),
    accounts: async () => {
      const [kakao, youtube] = await Promise.all([kakaoStatus(), getYouTubeMusicAuth().status()]);
      return { kakaotalk: kakaoAccountState(kakao.memo), youtube_music: youTubeAccountState(youtube.state) };
    },
  });
}
