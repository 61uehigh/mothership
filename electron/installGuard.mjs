// Before `pnpm app:install` replaces the running app, it waits for sessions in
// the middle of a turn to finish, so an update never cuts agents off unasked.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * @typedef {{ id: string; name: string; lead?: string }} RunningSession
 * A session working right now; `lead` names the session a sub-agent works for.
 */

/**
 * ### SERVER_INFO_FILE
 *
 * The file in the data folder where the running app writes the port its
 * server listens on (see `main.mjs`), and removes when it stops the server.
 */
export const SERVER_INFO_FILE = "server.json";

/**
 * ### describeRunning
 *
 * One indented line per running session, a sub-agent with the session it
 * works for, e.g. `  • fix-tests (in Release prep)`.
 *
 * @param {ReadonlyArray<RunningSession>} running
 */
export function describeRunning(running) {
  return running.map((session) => `  • ${session.name}${session.lead === undefined ? "" : ` (in ${session.lead})`}`).join("\n");
}

/**
 * ### parseWaitMinutes
 *
 * Reads `--wait-minutes=N` from the command line. Anything but a number of
 * zero or more is refused here: a `NaN` would make {@link waitUntilIdle}
 * poll the server in a tight loop forever.
 *
 * @param {ReadonlyArray<string>} argv
 * @param {number} fallback - Minutes when the flag is absent.
 * @returns {number}
 * @throws {Error} When the value is not a number of zero or more.
 */
export function parseWaitMinutes(argv, fallback) {
  const raw = argv.find((arg) => arg.startsWith("--wait-minutes="))?.slice("--wait-minutes=".length);
  if (raw === undefined) return fallback;
  const minutes = raw.trim() === "" ? Number.NaN : Number(raw);
  if (!Number.isFinite(minutes) || minutes < 0) throw new Error(`--wait-minutes takes a number of minutes, not "${raw}"`);
  return minutes;
}

/**
 * ### waitUntilIdle
 *
 * Asks until no session is working, or the time is up. Prints when the set of
 * running sessions changes, and a reminder every `progressMs` while it doesn't.
 * Pure apart from what it is given, so a fake clock can drive it.
 *
 * @param {object} options
 * @param {() => Promise<ReadonlyArray<RunningSession>>} options.check - The sessions working now.
 * @param {(ms: number) => Promise<void>} options.sleep
 * @param {() => number} options.now - Milliseconds.
 * @param {number} options.timeoutMs - Give up after this long.
 * @param {number} options.pollMs - How often to ask.
 * @param {number} options.progressMs - How often to say it is still waiting.
 * @param {(line: string) => void} options.log
 * @returns {Promise<{ idle: true } | { idle: false; running: ReadonlyArray<RunningSession> }>}
 */
export async function waitUntilIdle({ check, sleep, now, timeoutMs, pollMs, progressMs, log }) {
  const started = now();
  let shown = "";
  let lastNote = started;
  for (;;) {
    const running = await check();
    if (running.length === 0) {
      if (shown !== "") log("All sessions finished.");
      return { idle: true };
    }
    const key = running.map((session) => session.id).join(",");
    const waited = now() - started;
    if (key !== shown) {
      log(`Waiting for ${running.length} working ${running.length === 1 ? "session" : "sessions"} to finish:\n${describeRunning(running)}`);
      shown = key;
      lastNote = now();
    } else if (now() - lastNote >= progressMs) {
      log(`Still waiting (${Math.round(waited / 60_000)} min of ${Math.round(timeoutMs / 60_000)})…`);
      lastNote = now();
    }
    if (waited >= timeoutMs) return { idle: false, running };
    await sleep(Math.min(pollMs, timeoutMs - waited));
  }
}

/**
 * ### runningInstalledSessions
 *
 * The sessions working in the installed app, asked from its server; if the
 * server can't be asked, or answers without a `running` list (an older app
 * without the endpoint), read from its
 * session database instead. Call only while the app is running: after a
 * crash the database may still say `running` for turns that are gone.
 *
 * @param {string} dataDir - The app's data folder in Application Support.
 * @returns {Promise<Array<RunningSession>>}
 */
export async function runningInstalledSessions(dataDir) {
  try {
    const { port } = JSON.parse(readFileSync(path.join(dataDir, SERVER_INFO_FILE), "utf8"));
    const response = await fetch(`http://127.0.0.1:${port}/api/agents/running`, { signal: AbortSignal.timeout(3_000) });
    const body = response.ok ? await response.json() : undefined;
    if (Array.isArray(body?.running)) return body.running;
  } catch {
    // Not answering: fall back to the database below.
  }
  const file = path.join(dataDir, ".mothership", "mothership.db");
  if (!existsSync(file)) return [];
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    return db
      .prepare(
        `SELECT a.id, a.name, p.name AS lead FROM agents a LEFT JOIN agents p ON p.id = a.parent_id WHERE a.status = 'running'`,
      )
      .all()
      .map((row) => ({ id: String(row.id), name: String(row.name), ...(row.lead == null ? {} : { lead: String(row.lead) }) }));
  } finally {
    db.close();
  }
}
