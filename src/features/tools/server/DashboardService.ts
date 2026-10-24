import type { SearchGroup, ToolKind, WidgetInfo, WidgetResult } from "@/features/tools/model/Dashboard";
import type { DashboardConfig } from "@/features/tools/server/DashboardConfig";
import { isToolWidget, type SourceContext, type ToolSource, type ToolSources, type ToolWidget } from "@/features/tools/server/ToolSource";
import type { McpConfig, McpServer } from "@/platform/mcp/McpRegistry";
import { ToolNotFoundError, withSignal, type ToolCaller } from "@/platform/mcp/ToolCaller";

// Search answers while you type, so it gives up sooner than a widget or a detail view.
const MCP_SEARCH_TIMEOUT_MS = 10_000;
const MCP_LOAD_TIMEOUT_MS = 25_000;
// A connector relay starts a short Claude session first (and may wait for a relay slot), so it needs longer.
const CONNECTOR_TIMEOUT_MS = 50_000;

const CONNECTOR_NOTE = "Via claude.ai connector · each refresh uses a little Claude usage";

function timeoutFor(widget: ToolWidget, purpose: "search" | "load"): number {
  if (widget.via === "claude-connector") return CONNECTOR_TIMEOUT_MS;
  return purpose === "search" ? MCP_SEARCH_TIMEOUT_MS : MCP_LOAD_TIMEOUT_MS;
}

type Resolved = { ok: true; caller: ToolCaller } | { ok: false; reason: string };

/**
 * ### ToolOutcome
 *
 * The result of {@link DashboardService.callTool}.
 * - `ok`: `run` finished with `value`.
 * - `unavailable`: no widget of that kind, or its source is not set up.
 * - `error`: the tool was reached but `run` threw; `message` is user-facing.
 */
export type ToolOutcome<T> =
  | { status: "ok"; value: T }
  | { status: "unavailable"; reason: string }
  | { status: "error"; message: string; notFound: boolean };

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Runs `run` with a deadline: the signal it gets is aborted when time is up,
 * so the backend stops the call (a relay call stops spending usage), and the
 * result rejects then even if a backend ignores the signal.
 */
async function withDeadline<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      run(controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error(`No response within ${ms / 1000} seconds`));
        }, ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * ### WidgetResults
 *
 * Cached and running loads by widget id.
 */
export type WidgetResults = { cache: Map<string, WidgetResult>; inflight: Map<string, Promise<WidgetResult>> };

/**
 * ### DashboardDeps
 *
 * What the dashboard needs from outside; the composition root provides it.
 */
export type DashboardDeps = {
  /** One source per tool kind. */
  sources: ToolSources;
  /** The dashboard config with your Settings choices applied, read fresh each time. */
  loadConfig: () => Promise<DashboardConfig>;
  /** The MCP config with your Settings choices applied. */
  mcpConfig: () => Promise<McpConfig>;
  /** A caller for an MCP server, over a shared connection. */
  mcpCaller: (server: McpServer) => ToolCaller;
  /** A caller for a claude.ai connector, by name. */
  connectorCaller: (connector: string) => ToolCaller;
  /** Shared so every route sees the same cache and an invalidation from one reaches the rest. */
  results: WidgetResults;
};

/**
 * ### DashboardService
 *
 * Loads tool widgets through MCP with a per-widget cache, and runs unified
 * search across tools. Never throws for tool failures: they become
 * `unavailable` or `error` results the UI can show in place.
 */
export class DashboardService {
  readonly #deps: DashboardDeps;
  readonly #cache: Map<string, WidgetResult>;
  readonly #inflight: Map<string, Promise<WidgetResult>>;
  /** Loads let go by `invalidate` while running; their answers are not cached. */
  readonly #invalidated = new WeakSet<Promise<WidgetResult>>();

  async #resolve(widget: ToolWidget): Promise<Resolved> {
    if (widget.disabled) return { ok: false, reason: `${widget.title} is turned off in Settings.` };
    if (widget.via === "claude-connector") return { ok: true, caller: this.#deps.connectorCaller(widget.connector) };
    let config: McpConfig;
    try {
      config = await this.#deps.mcpConfig();
    } catch (error) {
      // A half-edited mcp.yaml must not break every widget until the server restarts.
      return { ok: false, reason: `Could not read the MCP config: ${message(error)}` };
    }
    const { servers, unavailable } = config;
    const server = servers.find((s) => s.name === widget.server);
    if (server !== undefined) return { ok: true, caller: this.#deps.mcpCaller(server) };
    const reason =
      unavailable.find((u) => u.name === widget.server)?.reason ?? `No "${widget.server}" server in mcp.yaml`;
    return { ok: false, reason };
  }

  constructor(deps: DashboardDeps) {
    this.#deps = deps;
    this.#cache = deps.results.cache;
    this.#inflight = deps.results.inflight;
  }

  /** The source for `widget`, typed by its kind. */
  #source(widget: ToolWidget): ToolSource<ToolWidget> {
    // `sources` is keyed by kind, so the source for `widget.type` accepts exactly this widget.
    return this.#deps.sources[widget.type] as ToolSource<ToolWidget>;
  }

  /**
   * ### config
   *
   * @returns The dashboard config in effect, for tool modules that need their widget's settings.
   */
  config(): Promise<DashboardConfig> {
    return this.#deps.loadConfig();
  }

  /**
   * ### widgets
   *
   * @returns Widget list in display order, plus the auto-refresh interval.
   */
  async widgets(): Promise<{ widgets: Array<WidgetInfo>; refreshSeconds: number }> {
    const config = await this.#deps.loadConfig();
    return {
      widgets: config.widgets.map((w) => ({ id: w.id, kind: w.type, title: w.title })),
      refreshSeconds: config.refreshSeconds,
    };
  }

  /**
   * ### invalidate
   *
   * Drops cached results of every widget of `kind`, after a change made from
   * mothership (a reply, an RSVP, a new source chosen in Settings) so the
   * next load shows it instead of waiting out `refreshSeconds`. A load still
   * running is let go too: its answer may come from before the change.
   */
  async invalidate(kind: ToolKind): Promise<void> {
    const config = await this.#deps.loadConfig();
    for (const widget of config.widgets) {
      if (widget.type !== kind) continue;
      this.#cache.delete(widget.id);
      const running = this.#inflight.get(widget.id);
      if (running !== undefined) this.#invalidated.add(running);
      this.#inflight.delete(widget.id);
    }
  }

  /**
   * ### load
   *
   * @param id - Widget id from `config/dashboard.yaml`.
   * @param refresh - Ignore a cached result younger than `refreshSeconds`.
   * @returns The widget's result, or `undefined` for an unknown or non-tool widget.
   */
  async load(id: string, refresh: boolean): Promise<WidgetResult | undefined> {
    const config = await this.#deps.loadConfig();
    const widget = config.widgets.find((w) => w.id === id);
    if (widget === undefined || !isToolWidget(widget)) return undefined;

    const cached = this.#cache.get(id);
    const ttlSeconds = widget.refreshSeconds ?? config.refreshSeconds;
    if (!refresh && cached !== undefined && Date.now() - cached.fetchedAt < ttlSeconds * 1000) return cached;
    const running = this.#inflight.get(id);
    if (running !== undefined) return running;

    const promise = this.#fetch(widget, config);
    this.#inflight.set(id, promise);
    let result: WidgetResult;
    try {
      result = await promise;
    } finally {
      // Never left behind, even if the load threw; the next load starts fresh.
      if (this.#inflight.get(id) === promise) this.#inflight.delete(id);
    }
    // Cached only while still current: an invalidated load answers its caller but is not kept.
    if (!this.#invalidated.has(promise)) this.#cache.set(id, result);
    return result;
  }

  async #fetch(widget: ToolWidget, config: DashboardConfig): Promise<WidgetResult> {
    const fetchedAt = Date.now();
    const resolved = await this.#resolve(widget);
    if (!resolved.ok) return { status: "unavailable", reason: resolved.reason, fetchedAt };
    try {
      const context: SourceContext = { now: fetchedAt, timeZone: config.timezone };
      const source = this.#source(widget);
      const items = await withDeadline(timeoutFor(widget, "load"), (signal) => source.load(withSignal(resolved.caller, signal), widget, context));
      const notes = [source.note, widget.via === "claude-connector" ? CONNECTOR_NOTE : undefined].filter(Boolean);
      return { status: "ok", items, note: notes.length === 0 ? undefined : notes.join(" · "), fetchedAt };
    } catch (error) {
      return { status: "error", message: message(error), fetchedAt };
    }
  }

  /**
   * ### loadBySource
   *
   * Loads, fresh, the first widget that reads from the MCP server `server`
   * (e.g. for a connection test in Settings).
   *
   * @returns The widget's result, or `undefined` when no widget reads from it.
   */
  async loadBySource(server: string): Promise<WidgetResult | undefined> {
    const config = await this.#deps.loadConfig();
    const widget = config.widgets.filter(isToolWidget).find((w) => w.server === server);
    return widget === undefined ? undefined : this.load(widget.id, true);
  }

  /**
   * ### search
   *
   * Searches every tool that has a widget, in parallel. Each tool answers
   * within its timeout or reports an error; slow tools never hold back the
   * others' results.
   *
   * @returns One group per tool, in widget order.
   */
  async search(query: string): Promise<Array<SearchGroup>> {
    const config = await this.#deps.loadConfig();
    const now = Date.now();
    const firstOfKind = new Map<ToolKind, ToolWidget>();
    for (const widget of config.widgets) {
      if (isToolWidget(widget) && !firstOfKind.has(widget.type)) firstOfKind.set(widget.type, widget);
    }

    return Promise.all(
      [...firstOfKind.values()].map(async (widget): Promise<SearchGroup> => {
        const fetchedAt = Date.now();
        const resolved = await this.#resolve(widget);
        if (!resolved.ok) {
          return { kind: widget.type, title: widget.title, result: { status: "unavailable", reason: resolved.reason, fetchedAt } };
        }
        try {
          const context: SourceContext = { now, timeZone: config.timezone };
          const items = await withDeadline(timeoutFor(widget, "search"), (signal) =>
            this.#source(widget).search(withSignal(resolved.caller, signal), widget, query, context),
          );
          return { kind: widget.type, title: widget.title, result: { status: "ok", items, note: undefined, fetchedAt } };
        } catch (error) {
          return { kind: widget.type, title: widget.title, result: { status: "error", message: message(error), fetchedAt } };
        }
      }),
    );
  }

  /**
   * ### myNames
   *
   * @returns The `me.names` from `config/dashboard.yaml`, for highlighting you in tool content.
   */
  async myNames(): Promise<Array<string>> {
    return (await this.#deps.loadConfig()).me.names;
  }

  /**
   * ### callTool
   *
   * Runs `run` with the caller of the first widget of `kind` in
   * `config/dashboard.yaml`, so detail views (a Nuclino doc, a Linear issue)
   * use the same source as the widget that listed them. Not cached.
   *
   * @param kind - Tool whose widget source to use.
   * @param run - Makes the tool calls and parses their output.
   * @param options - `write` for calls that change something (send, reply,
   *   react, RSVP): they get no outer deadline, because abandoning one midway
   *   could report a failure for something that then happens, and a retry
   *   would do it twice. The backend's own timeout still applies.
   * @returns `run`'s value, or why it could not run or failed.
   */
  async callTool<T>(kind: ToolKind, run: (caller: ToolCaller) => Promise<T>, options: { write?: boolean } = {}): Promise<ToolOutcome<T>> {
    const config = await this.#deps.loadConfig();
    const widget = config.widgets.filter(isToolWidget).find((w) => w.type === kind);
    if (widget === undefined) {
      return { status: "unavailable", reason: `No ${kind} widget in config/dashboard.yaml` };
    }
    const resolved = await this.#resolve(widget);
    if (!resolved.ok) return { status: "unavailable", reason: resolved.reason };
    try {
      const value =
        options.write === true
          ? await run(resolved.caller)
          : await withDeadline(timeoutFor(widget, "load"), (signal) => run(withSignal(resolved.caller, signal)));
      return { status: "ok", value };
    } catch (error) {
      return { status: "error", message: message(error), notFound: error instanceof ToolNotFoundError };
    }
  }
}
