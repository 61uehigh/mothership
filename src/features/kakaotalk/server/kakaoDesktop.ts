import { z } from "zod";
import type { KakaoChats, KakaoOpenTarget, MacPermission } from "@/features/kakaotalk/model/KakaoTalk";
import { parseDockBadge, pickChatList } from "@/features/kakaotalk/server/chatList";
import { KakaoError, serverPlatform } from "@/features/kakaotalk/server/kakaoApi";
import { CliBinary, failureDetail } from "@/platform/cli";

const MAC_BUNDLE_ID = "com.kakao.KakaoTalkMac";
const TIMEOUT_MS = 20_000;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const PERMISSION_PANES: Record<MacPermission, string> = {
  accessibility: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
  automation: "x-apple.systempreferences:com.apple.preference.security?Privacy_Automation",
};
/** Read when called: the server may change `process.env` after a Settings save. */
const OPTIONS_OF = () => ({ timeoutMs: TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES, env: process.env });

const OPEN = new CliBinary(["/usr/bin/open"]);
const LSAPPINFO = new CliBinary(["/usr/bin/lsappinfo"]);
const OSASCRIPT = new CliBinary(["/usr/bin/osascript"]);

/** How many chats from the top of the list are read; each row costs a few Apple events (about 0.1–0.2 s). */
const MAX_ROWS = 20;

/**
 * Reads the KakaoTalk window through System Events (JavaScript for
 * Automation). The chat list is a table in a scroll area of the main
 * window; each row has one cell holding a profile button, static texts
 * (the room's name, a group's member count, the time) and a text view in a
 * scroll area (the last message). Rows are read one at a time and only the
 * first few: a batched read of every row takes seconds, since the app
 * answers each element separately. A table whose first rows have no last
 * message (an open chat's messages, say) is left after three rows.
 *
 * `list` prints each table's first rows as texts; `open <table> <row> <name>`
 * selects that row, checking it still shows `name`, and presses Return to
 * open the chat. Only reads what the window shows; it never touches
 * KakaoTalk's files.
 */
const SCRIPT = String.raw`
function attempt(get, fallback) { try { const v = get(); return v === null || v === undefined ? fallback : v; } catch (e) { return fallback; } }
function text(v) { const s = v === null || v === undefined ? "" : String(v); return s === "missing value" ? "" : s; }
function rowTexts(row) {
  const cell = row.uiElements[0];
  const out = attempt(function () { return cell.staticTexts.value(); }, []).map(function (v) { return { role: "AXStaticText", text: text(v) }; });
  const message = text(attempt(function () { return cell.scrollAreas[0].textAreas[0].value(); }, ""));
  if (message !== "") out.push({ role: "AXTextArea", text: message });
  return out.filter(function (t) { return t.text !== ""; });
}
function run(argv) {
  const se = Application("System Events");
  const procs = se.applicationProcesses.whose({ bundleIdentifier: "${MAC_BUNDLE_ID}" });
  if (procs.length === 0) return JSON.stringify({ running: false, tables: [] });
  const proc = procs[0];
  const tables = [];
  const windows = attempt(function () { return proc.windows.length; }, 0);
  for (let w = 0; w < windows; w++) {
    const areas = proc.windows[w].scrollAreas;
    const areaCount = attempt(function () { return areas.length; }, 0);
    for (let a = 0; a < areaCount; a++) {
      const count = attempt(function () { return areas[a].tables.length; }, 0);
      for (let t = 0; t < count; t++) tables.push(areas[a].tables[t]);
    }
  }
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
  tables: z.array(z.object({ rows: z.array(z.array(z.object({ role: z.string(), text: z.string() }))) })),
});
const openOutputSchema = z.object({ running: z.boolean(), opened: z.boolean() });

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

const PERMISSION_PROBLEMS: Record<MacPermission, string> = {
  automation: "Allow mothership to control System Events: System Settings → Privacy & Security → Automation.",
  accessibility:
    "Allow mothership in System Settings → Privacy & Security → Accessibility (in development, the app that runs the dev server, such as your terminal).",
};

/**
 * ### permissionProblem
 *
 * Why `osascript` was refused, in words to show; `undefined` when it failed for another reason.
 */
export function permissionProblem(stderr: string): string | undefined {
  const missing = missingPermission(stderr);
  return missing === undefined ? undefined : PERMISSION_PROBLEMS[missing];
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
  if (serverPlatform() !== "mac") return { state: "unsupported" };
  const dock = await dockUnread();
  if (!dock.running) return { state: "not-running" };
  const result = await runScript(["list"]);
  if (!result.ok) {
    const missing = missingPermission(result.stderr);
    if (missing !== undefined) return { state: "no-access", missing, detail: PERMISSION_PROBLEMS[missing], unread: dock.unread };
    throw new KakaoError(`Reading KakaoTalk failed: ${failureDetail(result.stderr, result.cause).slice(-300)}`, 502, "failed");
  }
  const parsed = listOutputSchema.safeParse(JSON.parse(result.stdout.trim() || "{}"));
  if (!parsed.success) throw new KakaoError("Reading KakaoTalk returned an unexpected shape.", 502, "failed");
  if (!parsed.data.running) return { state: "not-running" };
  const chats = pickChatList(parsed.data.tables);
  return chats === undefined ? { state: "no-list", unread: dock.unread } : { state: "ok", chats, unread: dock.unread };
}

/**
 * ### openKakao
 *
 * Brings KakaoTalk to the front: the app (on any computer, through its
 * `kakaotalk://` link outside a Mac), one chat from the list (Mac only), or
 * the System Settings pane of a permission reading chats needs (Mac only).
 *
 * @throws {@link KakaoError} 404 When KakaoTalk is not installed or the chat moved; 400 for a Mac-only target elsewhere.
 */
export async function openKakao(target: KakaoOpenTarget): Promise<void> {
  const platform = serverPlatform();
  if (target.kind === "app") {
    const outcome =
      platform === "mac"
        ? await OPEN.run(["-b", MAC_BUNDLE_ID], OPTIONS_OF())
        : platform === "windows"
          ? await new CliBinary(["rundll32.exe"]).run(["url.dll,FileProtocolHandler", "kakaotalk://"], OPTIONS_OF())
          : await new CliBinary(["xdg-open"]).run(["kakaotalk://"], OPTIONS_OF());
    if (outcome.kind !== "ok") throw new KakaoError("Couldn't open KakaoTalk. Is it installed on this computer?", 404, "missing");
    return;
  }
  if (platform !== "mac") throw new KakaoError("This works only when mothership runs on a Mac.", 400, "unsupported");
  if (target.kind === "accessibility" || target.kind === "automation") {
    await OPEN.run([PERMISSION_PANES[target.kind]], OPTIONS_OF());
    return;
  }
  const result = await runScript(["open", String(target.at.table), String(target.at.row), target.name]);
  if (!result.ok) {
    throw new KakaoError(permissionProblem(result.stderr) ?? `Opening the chat failed: ${failureDetail(result.stderr, result.cause).slice(-300)}`, 502, "failed");
  }
  const parsed = openOutputSchema.safeParse(JSON.parse(result.stdout.trim() || "{}"));
  if (!parsed.success || !parsed.data.opened) throw new KakaoError("That chat moved in KakaoTalk. Refresh and try again.", 404, "moved");
}
