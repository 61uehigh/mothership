import { checkDocker } from "@/features/docker/server/dockerCli";
import { FileService } from "@/features/explorer/server/FileService";
import { checkGitHubCli } from "@/features/github/server/gh";
import { AgentRuntime } from "@/features/sessions/server/AgentRuntime";
import { AgentStore } from "@/features/sessions/server/AgentStore";
import { checkProviders } from "@/features/sessions/server/providerChecks";
import { gmailAccountState, googleAccountState } from "@/features/settings/model/Settings";
import { SettingsService } from "@/features/settings/server/SettingsService";
import { readSettings, savedLead } from "@/features/settings/server/settingsFile";
import { GoogleSignIn } from "@/features/settings/server/GoogleSignIn";
import { TOOL_KINDS, type ToolKind } from "@/features/tools/model/Dashboard";
import { loadDashboardConfig, type DashboardConfig } from "@/features/tools/server/DashboardConfig";
import { DashboardService, type WidgetResults } from "@/features/tools/server/DashboardService";
import { DETAIL_PREFIXES, DetailCache } from "@/features/tools/server/DetailCache";
import { sidebarState } from "@/features/tools/server/sidebarState";
import { cachedLinearNotifications, markLinear } from "@/features/tools/linear/server/linearNotifications";
import { TOOL_SOURCES } from "@/features/tools/server/toolSources";
import { toolValue } from "@/features/tools/server/toolFailure";
import { addDays, zonedDate, zonedMidnight } from "@/lib/dates";
import { UsageTracker } from "@/features/usage/server/UsageTracker";
import { SystemMonitor } from "@/features/usage/server/SystemMonitor";
import { connectorCaller } from "@/platform/mcp/connectorCaller";
import { McpClientPool } from "@/platform/mcp/McpClientPool";
import { RateLimitGate } from "@/platform/mcp/RateLimitGate";
import { withCallPurpose } from "@/platform/mcp/callPurpose";
import { ToolCallLedger } from "@/platform/mcp/ToolCallLedger";
import { processState } from "@/platform/processState";
import { loadMcpConfig, type McpConfig } from "@/platform/mcp/mcpConfig";
import type { ToolCaller } from "@/platform/mcp/ToolCaller";
import { appPath, dataPath, workspaceDir } from "@/platform/paths";
import { UsageLog } from "@/features/insights/server/UsageLog";
import { loadInboxInputs, type InboxSources } from "@/features/inbox/server/inboxInputs";
import { InboxService } from "@/features/inbox/server/InboxService";
import { InboxReadStore } from "@/features/inbox/server/InboxReadStore";
import { getAllOverview } from "@/features/github/server/overview";
import { myPrEvents, myPrStatuses } from "@/features/github/server/myPrActivity";
import { PrSummaryService } from "@/features/github/server/PrSummaryService";
import { FeedbackService } from "@/features/feedback/server/FeedbackService";
import { MeetingsService } from "@/features/meetings/server/MeetingsService";
import { listMeetingNotes, listNuclinoCollections, readMeetingNote, restoreNuclinoItems, saveNuclinoItems } from "@/features/tools/nuclino/server/nuclinoMeetings";
import { nuclinoUrl } from "@/features/tools/model/toolUrls";
import { TodoStore } from "@/features/todos/server/TodoStore";
import { DailyService } from "@/features/todos/server/DailyService";
import { linearActivity, meetingActivity, prActivity, sessionActivity } from "@/features/todos/server/activitySources";
import { canQueryLinearDirectly, fetchMyCompletedIssues } from "@/features/tools/linear/server/linearApi";
import { calendarRange } from "@/features/tools/calendar/server/calendarRange";
import { YouTubeMusicAuth } from "@/features/youtube-music/server/YouTubeMusicAuth";
import { youtubeChannelName } from "@/features/youtube-music/server/youtubeApi";
import { GmailAuth } from "@/features/gmail/server/GmailAuth";
import { GmailService, gmailMailbox } from "@/features/gmail/server/GmailService";
import { demoMailbox } from "@/features/gmail/server/demoMailbox";

/**
 * Everything that holds state. Kept on `globalThis` because each route can
 * load its own copy of this module and a dev reload loads a new one; they
 * must all share one runtime, one set of MCP connections, and one cache.
 */
type State = {
  usage: UsageTracker;
  usageLog: UsageLog;
  runtime: AgentRuntime;
  widgetResults: WidgetResults;
  details: DetailCache;
  /** Services made on first use; see {@link shared}. */
  lazy?: Partial<LazyServices>;
};

type LazyServices = {
  pool: McpClientPool;
  todos: TodoStore;
  rateLimits: RateLimitGate;
  toolCalls: ToolCallLedger;
  googleSignIn: GoogleSignIn;
  youtubeMusic: YouTubeMusicAuth;
  gmailAuth: GmailAuth;
  gmail: GmailService;
  inbox: InboxService;
  meetings: MeetingsService;
  prSummaries: PrSummaryService;
  system: SystemMonitor;
  daily: DailyService;
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
  const { connections, profile, timezone, inbox } = await readSettings();
  // The Inbox's @here / @channel rule decides whether the Slack widget searches for them at all.
  return loadDashboardConfig({ connections: usesCustomConfig() ? {} : connections, profile, timezone, slackGroupMentions: inbox.slackGroupMention !== "hidden" });
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

/**
 * When the server is told to stop (the desktop app quits or is updated, the dev
 * server restarts), records running turns as stopped by the restart before
 * anything else runs, so they can be continued later. Agents are often
 * signalled at the same moment and would otherwise end as failed (exit code
 * 143). Runs ahead of Next's own handler, which exits soon after; the record is
 * written synchronously, so it survives that. `exit` covers other ways out.
 */
function stopTurnsOnShutdown(runtime: AgentRuntime): void {
  const shutdown = () => {
    const stopped = runtime.shutdown();
    if (stopped.length > 0) console.error(`[mothership] stopping: ${stopped.length} running turn(s) recorded as stopped by the restart`);
  };
  process.prependListener("SIGTERM", shutdown);
  process.prependListener("SIGINT", shutdown);
  process.prependListener("exit", shutdown);
}

function state(): State {
  if (globalRef.__mothership === undefined) {
    const usage = new UsageTracker();
    const onRateLimit = (info: unknown) => usage.recordClaude(info);
    const runtime = new AgentRuntime({
      store: new AgentStore(dataPath(".mothership", "mothership.db")),
      defaultFolder,
      worktreesDir: dataPath(".mothership", "worktrees"),
      // `||` on purpose: the .env template leaves this as an empty string.
      baseUrl: process.env.MOTHERSHIP_BASE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`,
      environment: { mcpConfig, onRateLimit, controlScript: appPath("scripts", "control-mcp.mjs"),
        promptSuggestions: async () => (await readSettings()).promptSuggestions,
      },
      autoContinue: async () => (await readSettings()).autoContinue,
    });
    stopTurnsOnShutdown(runtime);
    globalRef.__mothership = {
      usage,
      usageLog: new UsageLog(dataPath(".mothership", "usage.db")),
      runtime,
      widgetResults: { cache: new Map(), inflight: new Map() },
      details: new DetailCache(),
    };
  }
  return globalRef.__mothership;
}

/**
 * The service in `key`, made on first use. A hot reload of its class leaves
 * the old instance running the old code, so one that is no longer an
 * instance of `type` is made again, after `dispose` releases what the old
 * one holds (its methods are the old code's, typed as the new class's).
 */
function shared<K extends keyof LazyServices>(
  key: K,
  type: abstract new (...args: never[]) => LazyServices[K],
  make: () => LazyServices[K],
  dispose?: (stale: LazyServices[K]) => void,
): LazyServices[K] {
  const lazy = (state().lazy ??= {});
  const current = lazy[key];
  if (current instanceof type) return current;
  if (current !== undefined) dispose?.(current);
  const made = make();
  lazy[key] = made;
  return made;
}

/** The MCP connections every route shares; a reloaded pool's servers are closed before a new one starts them. */
function pool(): McpClientPool {
  return shared("pool", McpClientPool, () => new McpClientPool(), (stale) => void stale.retain(new Set()));
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
        origin: "feedback",
      });
    },
    toolCalls: () => getToolCalls().counts(Date.now() - TOOL_CALLS_WINDOW_MS),
  });
}

/** How far back the debug panel counts work-tool calls. */
const TOOL_CALLS_WINDOW_MS = 10 * 60_000;

/** Today in the dashboard's time zone (Settings → General, else `dashboard.yaml`, else this computer's), `YYYY-MM-DD`: the zone Calendar and Linear use. */
const zonedToday = async () => zonedDate(Date.now(), (await dashboardConfig()).timezone);

/** The Inbox's sources: the same cached widgets (the Calendar sidebar's week included) and Gmail list the sections read, so no extra calls. */
const inboxSources: InboxSources = {
  sessions: () => getRuntime().snapshot(),
  widget: (kind, refresh) => getDashboard().loadKind(kind, refresh),
  linearNotifications: (refresh) => cachedLinearNotifications(toolAccess(), refresh),
  github: async (refresh) => {
    const [overview, statuses] = await Promise.all([getAllOverview(refresh), myPrStatuses(refresh)]);
    return { overview, statuses };
  },
  gmail: (refresh) => getGmail().inboxMail(refresh),
};

/**
 * ### getInbox
 *
 * @returns The Inbox and its daily Claude review.
 */
export function getInbox(): InboxService {
  return shared("inbox", InboxService, () => new InboxService({ rules: async () => (await readSettings()).inbox, inputs: (refresh) => loadInboxInputs(inboxSources, refresh), timeZone: async () => (await dashboardConfig()).timezone, reads: new InboxReadStore(), markLinear: (ids, read) => markLinear(toolAccess(), ids, read) }));
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
 * @returns Claude and Codex usage limits and this computer's load.
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
 * ### getDaily
 *
 * @returns What you did each day according to GitHub, Linear, your sessions, and your calendar.
 */
export function getDaily(): DailyService {
  return shared(
    "daily",
    DailyService,
    () =>
      new DailyService({
        github: async ({ from, to }) => (await myPrEvents(from, to)).map(prActivity),
        linear: async ({ from, to }) =>
          canQueryLinearDirectly() ? (await fetchMyCompletedIssues(new Date(from).toISOString(), new Date(to).toISOString())).map(linearActivity) : [],
        sessions: async (range) => sessionActivity(getRuntime().snapshot().agents, range),
        // A calendar that is not set up answers 409, which Daily skips.
        calendar: async ({ day }) => meetingActivity(toolValue(await calendarRange(toolAccess(), day, 1, false)).events),
      }, {
        today: zonedToday,
        bounds: async (day) => {
          const { timezone } = await dashboardConfig();
          return { from: zonedMidnight(day, timezone), to: zonedMidnight(addDays(day, 1), timezone) };
        },
      }),
  );
}

/**
 * ### getYouTubeMusicAuth
 *
 * @returns Your YouTube sign-in, shared by every YouTube Music route.
 */
export function getYouTubeMusicAuth(): YouTubeMusicAuth {
  return shared("youtubeMusic", YouTubeMusicAuth, () => new YouTubeMusicAuth(dataPath(".mothership", "youtube-music-token.json"), undefined, youtubeChannelName));
}

/**
 * ### getGmailAuth
 *
 * @returns Your Gmail sign-in (with Google Calendar's OAuth client), shared by every Gmail route.
 */
export function getGmailAuth(): GmailAuth {
  return shared("gmailAuth", GmailAuth, () => new GmailAuth(dataPath(".mothership", "gmail-token.json")));
}

/**
 * ### getGmail
 *
 * @returns The Gmail section's and the Inbox's mail: made-up mail in demo mode, else your Gmail.
 */
export function getGmail(): GmailService {
  return shared("gmail", GmailService, () => new GmailService(usesCustomConfig() ? demoMailbox() : gmailMailbox(getGmailAuth())));
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
  const { widgetResults } = state();
  return new DashboardService({
    sources: TOOL_SOURCES,
    loadConfig: dashboardConfig,
    mcpConfig,
    mcpCaller: (server) => rateLimits().wrap(pool().caller(server)),
    connectorCaller: connector,
    results: widgetResults,
  });
}

/**
 * ### toolAccess
 *
 * @returns The work tools and the shared detail cache, which tool use cases take together.
 */
export function toolAccess(): { dashboard: DashboardService; details: DetailCache } {
  return { dashboard: getDashboard(), details: getDetailCache() };
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
 * settings, and closes MCP connections that are no longer used. Never
 * throws: the change it follows is already written, so a failure is logged.
 */
export async function afterSettingsChange(): Promise<void> {
  getDetailCache().forget("");
  // The change is already saved: a half-edited dashboard.yaml or a stuck MCP server must not answer an error.
  const dashboard = getDashboard();
  await Promise.all(TOOL_KINDS.map((kind) => dashboard.invalidate(kind))).catch((error: unknown) =>
    console.warn("[settings] Could not drop cached widget results after a change:", error),
  );
  const { servers } = await mcpConfig().catch(() => ({ servers: [] }));
  await pool()
    .retain(new Set(servers.map((s) => s.name)))
    .catch((error: unknown) => console.warn("[settings] Could not close unused MCP servers after a change:", error));
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
  await pool()
    .retain(new Set(servers.map((s) => s.name).filter((name) => name !== "google_calendar")))
    .catch((error: unknown) => console.warn("[settings] Could not close the Google Calendar server after sign-out:", error));
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

/**
 * ### getGoogleSignIn
 *
 * @returns The Google Calendar sign-in Settings runs for you.
 */
export function getGoogleSignIn(): GoogleSignIn {
  return shared("googleSignIn", GoogleSignIn, () => new GoogleSignIn());
}

/**
 * ### getSettingsService
 *
 * @returns The Settings screen's service. Not the settings themselves: those are
 *   `readSettings()` from the settings store.
 */
export function getSettingsService(): SettingsService {
  return new SettingsService({
    agents: checkProviders,
    tools: { github: checkGitHubCli, docker: checkDocker },
    sidebar: async () => sidebarState(await dashboardConfig()),
    loadWidget: (id) => withCallPurpose({ source: "connection test", background: false }, () => getDashboard().loadBySource(id)),
    cachedWidget: (id) => getDashboard().cachedBySource(id),
    accounts: async () => {
      const [youtube, gmail] = await Promise.all([getYouTubeMusicAuth().status(), getGmail().status()]);
      return { youtube_music: googleAccountState(youtube.state), gmail: gmailAccountState(gmail.state) };
    },
    clearSuggestions: () => getRuntime().clearSuggestions(),
  });
}
