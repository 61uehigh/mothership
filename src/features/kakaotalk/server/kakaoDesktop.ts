import { z } from "zod";
import type { KakaoChats, KakaoOpenTarget, KakaoWindowShape, MacPermission } from "@/features/kakaotalk/model/KakaoTalk";
import { parseDockBadge, pickChatList } from "@/features/kakaotalk/server/chatList";
import { KakaoError } from "@/features/kakaotalk/server/KakaoError";
import { CliBinary, failureDetail } from "@/platform/cli";
import { openUrl } from "@/platform/desktop/desktop";
import { HttpError } from "@/platform/http/HttpError";

/** Whether the server runs on a Mac, the only place KakaoTalk's window can be read. */
const onMac = () => process.platform === "darwin";

const MAC_BUNDLE_ID = "com.kakao.KakaoTalkMac";
const TIMEOUT_MS = 20_000;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
/** The System Settings pane of each permission (the `com.apple.preference.security` form opens nothing on macOS 27). */
const PERMISSION_PANES: Record<MacPermission, string> = {
  accessibility: "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_Accessibility",
  automation: "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_Automation",
};
/** Read when called: the server may change `process.env` after a Settings save. */
const OPTIONS_OF = () => ({ timeoutMs: TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES, env: process.env });

const OPEN = new CliBinary(["/usr/bin/open"]);
const LSAPPINFO = new CliBinary(["/usr/bin/lsappinfo"]);
const OSASCRIPT = new CliBinary(["/usr/bin/osascript"]);

/** How many chats from the top of the list are read; each row costs a few Apple events (about 0.1–0.2 s). */
const MAX_ROWS = 20;
/** How many elements the structure check describes at most, so a huge window cannot stall it. */
const MAX_SHAPE_NODES = 400;

/**
 * Reads the KakaoTalk window through System Events (JavaScript for
 * Automation). The chat list is a table (KakaoTalk 26.9: in a scroll area
 * of the main window; tables and outlines inside groups or split groups are
 * found too); each row has one cell holding a profile button, static texts
 * (the room's name, a group's member count, the time) and a text view in a
 * scroll area (the last message). Rows are read one at a time and only the
 * first few: a batched read of every row takes seconds, since the app
 * answers each element separately. A table whose first rows have no last
 * message (an open chat's messages, say) is left after three rows. A row
 * laid out another way is read as every text inside it.
 *
 * The window count is read without catching errors, so a refused
 * permission reaches stderr instead of reading as a closed window.
 *
 * `list` prints each table's first rows as texts; `open <table> <row> <name>`
 * selects that row, checking it still shows `name`, and presses Return to
 * open the chat; `shape` prints the window's structure without any text
 * (roles, child counts, text lengths), to see why no chat list was found. Only reads what the window shows; it never touches
 * KakaoTalk's files.
 */
const SCRIPT = String.raw`
function attempt(get, fallback) { try { const v = get(); return v === null || v === undefined ? fallback : v; } catch (e) { return fallback; } }
function text(v) { const s = v === null || v === undefined ? "" : String(v); return s === "missing value" ? "" : s; }
function children(el) { return attempt(function () { return el.uiElements(); }, []); }
function roleOf(el) { return text(attempt(function () { return el.role(); }, "")); }
const TEXT_ROLES = { AXStaticText: true, AXTextArea: true, AXTextField: true };
const LIST_ROLES = { AXTable: true, AXOutline: true };
const CONTAINER_ROLES = { AXGroup: true, AXSplitGroup: true, AXScrollArea: true, AXTabGroup: true, AXLayoutArea: true };
/** Every table or outline in el, searching nested groups, split groups and scroll areas, in the window's order. */
function findLists(el, depth, out) {
  const kids = children(el);
  for (let i = 0; i < kids.length; i++) {
    const role = roleOf(kids[i]);
    if (LIST_ROLES[role]) out.push(kids[i]);
    else if (CONTAINER_ROLES[role] && depth < 6) findLists(kids[i], depth + 1, out);
  }
  return out;
}
function walkTexts(el, depth, out) {
  const kids = children(el);
  for (let i = 0; i < kids.length; i++) {
    const role = roleOf(kids[i]);
    if (TEXT_ROLES[role]) out.push({ role: role, text: text(attempt(function () { return kids[i].value(); }, "")) });
    else if (depth < 4) walkTexts(kids[i], depth + 1, out);
  }
  return out;
}
function rowTexts(row) {
  // Fast path for the layout KakaoTalk 26.9 uses: one cell, its static texts, then the last message in a scrolled text view.
  const cell = row.uiElements[0];
  const out = attempt(function () { return cell.staticTexts.value(); }, []).map(function (v) { return { role: "AXStaticText", text: text(v) }; });
  const message = text(attempt(function () { return cell.scrollAreas[0].textAreas[0].value(); }, ""));
  if (message !== "") out.push({ role: "AXTextArea", text: message });
  const found = out.filter(function (t) { return t.text !== ""; });
  // Any other layout: every text in the row, however deep.
  return found.length > 0 ? found : walkTexts(row, 0, []).filter(function (t) { return t.text !== ""; });
}
/** The shape of el and what is under it, without any text: roles, subroles, child counts and text lengths. */
function shape(el, depth, out) {
  if (out.length >= ${MAX_SHAPE_NODES}) return;
  const role = roleOf(el);
  const subrole = text(attempt(function () { return el.subrole(); }, ""));
  const kids = children(el);
  const node = { depth: depth, role: role, subrole: subrole, children: kids.length };
  if (TEXT_ROLES[role]) node.textLength = text(attempt(function () { return el.value(); }, "")).length;
  out.push(node);
  if (depth >= 10) return;
  const limit = LIST_ROLES[role] || role === "AXList" ? 2 : 20;
  for (let i = 0; i < Math.min(kids.length, limit); i++) shape(kids[i], depth + 1, out);
}
function run(argv) {
  const se = Application("System Events");
  const procs = se.applicationProcesses.whose({ bundleIdentifier: "${MAC_BUNDLE_ID}" });
  if (procs.length === 0) return JSON.stringify({ running: false, windows: 0, tables: [] });
  const proc = procs[0];
  // Not wrapped in attempt: a refused permission must reach stderr, not read as a closed window.
  const windows = proc.windows.length;
  if (argv[0] === "shape") {
    const nodes = [];
    for (let w = 0; w < windows; w++) shape(proc.windows[w], 0, nodes);
    return JSON.stringify({ running: true, windows: windows, nodes: nodes });
  }
  const tables = [];
  for (let w = 0; w < windows; w++) findLists(proc.windows[w], 0, tables);
  if (argv[0] === "open") {
    const table = tables[Number(argv[1])];
    const rows = table === undefined ? 0 : attempt(function () { return table.rows.length; }, 0);
    const index = Number(argv[2]);
    if (index >= rows) return JSON.stringify({ running: true, opened: false });
    const row = table.rows[index];
    if (!rowTexts(row).some(function (t) { return t.text === argv[3]; })) return JSON.stringify({ running: true, opened: false });
    row.selected = true;
    proc.frontmost = true;
    delay(0.2);
    se.keyCode(36);
    return JSON.stringify({ running: true, opened: true });
  }
  return JSON.stringify({
    running: true,
    windows: windows,
    tables: tables.map(function (table) {
      const count = Math.min(attempt(function () { return table.rows.length; }, 0), ${MAX_ROWS});
      const rows = [];
      for (let r = 0; r < count; r++) {
        rows.push(rowTexts(table.rows[r]));
        // Only the chat list has a last message (a text view) in its rows; skip other tables, such as an open chat's messages, early.
        if (r === 2 && !rows.some(function (row) { return row.some(function (t) { return t.role === "AXTextArea"; }); })) break;
      }
      return { rows: rows };
    }),
  });
}
`;

const listOutputSchema = z.object({
  running: z.boolean(),
  windows: z.number(),
  tables: z.array(z.object({ rows: z.array(z.array(z.object({ role: z.string(), text: z.string() }))) })),
});
const shapeOutputSchema = z.object({
  running: z.boolean(),
  windows: z.number(),
  nodes: z
    .array(z.object({ depth: z.number(), role: z.string(), subrole: z.string(), children: z.number(), textLength: z.number().optional() }))
    .optional(),
});
const openOutputSchema = z.object({ running: z.boolean(), opened: z.boolean() });

/**
 * ### scriptOutput
 *
 * The JSON the script printed. `osascript` can print other text before it
 * (a JXA warning), so the last line is tried when the whole output is not JSON.
 *
 * @returns The parsed value; `{}` for no output; `undefined` when neither
 *   parses, which callers treat as an unexpected shape.
 */
export function scriptOutput(stdout: string): unknown {
  const text = stdout.trim();
  if (text === "") return {};
  for (const candidate of [text, text.split("\n").at(-1) ?? ""]) {
    try {
      return JSON.parse(candidate);
    } catch {
      continue;
    }
  }
  return undefined;
}

/**
 * ### missingPermission
 *
 * The permission `osascript` was refused; `undefined` when it failed for another reason.
 */
export function missingPermission(stderr: string): MacPermission | undefined {
  if (/-1743|Not authori[sz]ed to send Apple events/i.test(stderr)) return "automation";
  if (/-1719|-25211|assistive access|accessibility/i.test(stderr)) return "accessibility";
  return undefined;
}

async function runScript(args: Array<string>): Promise<{ ok: true; stdout: string } | { ok: false; stderr: string; cause: unknown }> {
  const outcome = await OSASCRIPT.run(["-l", "JavaScript", "-e", SCRIPT, ...args], OPTIONS_OF());
  if (outcome.kind === "ok") return { ok: true, stdout: outcome.value };
  if (outcome.kind === "missing") return { ok: false, stderr: "osascript is missing", cause: undefined };
  return { ok: false, stderr: outcome.stderr, cause: outcome.cause };
}

/** The Dock badge's unread total; `undefined` when KakaoTalk is not running. */
async function dockUnread(): Promise<{ running: boolean; unread: number | undefined }> {
  const pid = await LSAPPINFO.run(["info", "-only", "pid", "-app", MAC_BUNDLE_ID], OPTIONS_OF());
  if (pid.kind !== "ok" || !pid.value.includes("pid")) return { running: false, unread: undefined };
  const badge = await LSAPPINFO.run(["info", "-only", "StatusLabel", "-app", MAC_BUNDLE_ID], OPTIONS_OF());
  return { running: true, unread: badge.kind === "ok" ? parseDockBadge(badge.value) : undefined };
}

/**
 * ### readChats
 *
 * Reads the chat list the KakaoTalk app on this Mac shows, through the
 * Accessibility API. Elsewhere it answers `unsupported`: no official way
 * reads KakaoTalk chats, and this one only exists on a Mac.
 *
 * @returns The chats with the Dock badge's unread total, or why they could not be read.
 */
export async function readChats(): Promise<KakaoChats> {
  if (!onMac()) return { state: "unsupported" };
  const dock = await dockUnread();
  if (!dock.running) return { state: "not-running" };
  const result = await runScript(["list"]);
  if (!result.ok) {
    const missing = missingPermission(result.stderr);
    if (missing !== undefined) return { state: "no-access", missing, unread: dock.unread };
    throw new KakaoError(failureDetail(result.stderr, result.cause).slice(-300), 502, "read-failed");
  }
  const parsed = listOutputSchema.safeParse(scriptOutput(result.stdout));
  if (!parsed.success) throw new KakaoError(result.stdout.trim().slice(-300), 502, "read-failed");
  if (!parsed.data.running) return { state: "not-running" };
  const chats = pickChatList(parsed.data.tables);
  return chats === undefined ? { state: "no-list", windows: parsed.data.windows, unread: dock.unread } : { state: "ok", chats, unread: dock.unread };
}

/**
 * ### readWindowShape
 *
 * The structure of the KakaoTalk window as this server sees it, with the
 * permissions it was given: each element's role, subrole and child count,
 * and only the length of any text. For finding out why no chat list was
 * found when KakaoTalk changes its window; it never returns what the window says.
 *
 * @returns The elements in depth-first order, or why the window could not be read.
 */
export async function readWindowShape(): Promise<KakaoWindowShape> {
  if (!onMac()) return { state: "unsupported" };
  const result = await runScript(["shape"]);
  if (!result.ok) {
    const missing = missingPermission(result.stderr);
    if (missing !== undefined) return { state: "no-access", missing };
    throw new KakaoError(failureDetail(result.stderr, result.cause).slice(-300), 502, "read-failed");
  }
  const parsed = shapeOutputSchema.safeParse(scriptOutput(result.stdout));
  if (!parsed.success) throw new KakaoError("unexpected output", 502, "read-failed");
  if (!parsed.data.running) return { state: "not-running" };
  return { state: "ok", windows: parsed.data.windows, nodes: parsed.data.nodes ?? [] };
}

/**
 * ### openKakao
 *
 * Brings KakaoTalk to the front: the app (on a Mac by its bundle id, on
 * Windows through its `kakaotalk://` link), one chat from the list (Mac only), or
 * the System Settings pane of a permission reading chats needs (Mac only).
 *
 * @throws {@link KakaoError} 404 When KakaoTalk is not installed or the chat moved; 400 for a Mac-only target elsewhere;
 *   {@link HttpError} 501 for the app on a system other than macOS and Windows.
 */
export async function openKakao(target: KakaoOpenTarget): Promise<void> {
  if (target.kind === "app") {
    const missing = (cause?: unknown) => new KakaoError("KakaoTalk could not be opened", 404, "missing", { cause });
    if (onMac()) {
      if ((await OPEN.run(["-b", MAC_BUNDLE_ID], OPTIONS_OF())).kind !== "ok") throw missing();
      return;
    }
    try {
      await openUrl("kakaotalk://");
    } catch (error) {
      throw error instanceof HttpError && error.status === 404 ? missing(error) : error;
    }
    return;
  }
  if (!onMac()) throw new KakaoError("only on a Mac", 400, "unsupported");
  if (target.kind === "accessibility" || target.kind === "automation") {
    await OPEN.run([PERMISSION_PANES[target.kind]], OPTIONS_OF());
    return;
  }
  const result = await runScript(["open", String(target.at.table), String(target.at.row), target.name]);
  if (!result.ok) {
    const missing = missingPermission(result.stderr);
    if (missing !== undefined) throw new KakaoError(`the ${missing} permission was refused`, 502, missing);
    throw new KakaoError(failureDetail(result.stderr, result.cause).slice(-300), 502, "open-failed");
  }
  const parsed = openOutputSchema.safeParse(scriptOutput(result.stdout));
  if (!parsed.success || !parsed.data.opened) throw new KakaoError("the chat moved", 404, "moved");
}
