// The desktop app: starts mothership's server with Electron's own Node, then
// shows it in a window. Your data lives in Application Support, apart from the
// app, so updates never touch it.
import { spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { parseEnv } from "node:util";
import { app, BrowserWindow, dialog, session, shell } from "electron";
import { dialogLanguage, dialogText, LOCALE_STORAGE_KEY } from "./dialogText.mjs";
import { currentPlatform } from "./platform.mjs";

const platform = currentPlatform();
const STARTUP_TIMEOUT_MS = 60_000;
/** How long the server gets to record its running turns and stop its agents before everything it started is killed. */
const STOP_TIMEOUT_MS = 10_000;
/** One startup poll: a server that accepts the connection but never answers must not stall the loop. */
const POLL_TIMEOUT_MS = 2_000;
/** How long after the server exits its output may still arrive before the log file is closed. */
const LOG_DRAIN_MS = 1_000;
const LOG_MAX_BYTES = 5 * 1024 * 1024;
/**
 * The page's origin includes the port, and the browser keeps your tabs, sidebar
 * widths, and theme per origin, so the app sticks to one port when it can.
 */
const PREFERRED_PORT = 47821;
/** Links the app hands to your browser or mail app; anything else (file:, custom app schemes) is ignored. */
const EXTERNAL_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);
/** Browser permissions the app uses: notifications, and copying a command to the clipboard. */
const ALLOWED_PERMISSIONS = new Set(["notifications", "clipboard-sanitized-write"]);

/** Bundled files: inside the app when packaged, else `dist/` from `pnpm app:build`. */
const resources = app.isPackaged ? process.resourcesPath : path.resolve(import.meta.dirname, "..", "dist", "resources");
const serverDir = path.join(resources, "server");
/** The window and taskbar icon on Windows, where the .exe keeps Electron's (it is built without rcedit). */
const windowIcon = existsSync(path.join(resources, "icon.png")) ? path.join(resources, "icon.png") : undefined;
const dataDir = app.getPath("userData");
// Chromium's caches go in their own folder, so your data folder holds only your data.
app.setPath("sessionData", path.join(dataDir, "Chromium"));
const logFile = path.join(dataDir, "logs", "server.log");
/** Where `pnpm app:install` finds the server, to ask whether sessions are working before it replaces the app. */
const serverInfoFile = path.join(dataDir, "server.json");

/** How much of the server's latest output startup keeps, to read why it exited. */
const OUTPUT_TAIL_CHARS = 4_096;

/** The server exited while starting (`exited`) or did not answer within {@link STARTUP_TIMEOUT_MS} (`timeout`). */
class StartFailed extends Error {
  /** @param {"exited" | "timeout"} reason */
  constructor(reason) {
    const english = dialogText("en");
    super(reason === "exited" ? english.exitedWhileStarting(logFile) : english.startTimedOut(logFile));
    this.reason = reason;
  }
}

/** The server exited while starting because its port was in use. */
class PortTaken extends StartFailed {}

/** The app began quitting while the server was starting; nothing to report. */
class QuitWhileStarting extends Error {}

/** @type {import("node:child_process").ChildProcess | undefined} */
let server;
/** @type {string | undefined} */
let origin;
/** @type {BrowserWindow | undefined} */
let window;
let quitting = false;
/** Asking whether to quit while sessions work; a second ⌘Q meanwhile is ignored. */
let confirming = false;
/** Quit without asking: SIGTERM, as `pnpm app:install` sends after waiting for sessions itself. */
let quitWithoutAsking = false;

/** {@link PREFERRED_PORT} when it is free, else any free port on this computer. */
function freePort(port = PREFERRED_PORT) {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", (error) => (port === 0 ? reject(error) : resolve(freePort(0))));
    probe.listen(port, "127.0.0.1", () => {
      const address = probe.address();
      probe.close(() => (typeof address === "object" && address !== null ? resolve(address.port) : reject(new Error("No port"))));
    });
  });
}

/** Your saved keys and tokens (written by Settings); empty on a fresh install. */
function savedSecrets() {
  const file = path.join(dataDir, ".env.local");
  return existsSync(file) ? parseEnv(readFileSync(file, "utf8")) : {};
}

/** Keeps one older log, so the log never grows without limit. */
function rotateLog() {
  mkdirSync(path.dirname(logFile), { recursive: true });
  if (existsSync(logFile) && statSync(logFile).size > LOG_MAX_BYTES) renameSync(logFile, `${logFile}.1`);
}

/** Whether `url` is the app's own page (same scheme, host, and port). */
function isOwn(url) {
  try {
    return origin !== undefined && new URL(url).origin === origin;
  } catch {
    return false;
  }
}

/** Opens a web or mail link in its own app; other schemes from page content are ignored. */
function openOutside(url) {
  try {
    if (EXTERNAL_PROTOCOLS.has(new URL(url).protocol)) void shell.openExternal(url);
  } catch {
    // Not a URL: nothing to open.
  }
}

/**
 * Starts the server and waits until it answers.
 *
 * @param port - Where it listens.
 */
async function startServer(port) {
  rotateLog();
  const log = createWriteStream(logFile, { flags: "a" });
  log.write(`\n--- ${new Date().toISOString()} starting on port ${port}\n`);
  platform.prepareServer(resources);
  const loginPath = await platform.loginPath();
  const binaries = platform.binaries(resources);
  const started = spawn(process.execPath, [path.join(serverDir, "server.js")], {
    cwd: serverDir,
    ...platform.spawnOptions,
    env: {
      ...process.env,
      ...savedSecrets(),
      ...(loginPath === undefined ? {} : { PATH: loginPath }),
      // Run Electron's binary as plain Node; the server clears this for the programs it starts.
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      HOSTNAME: "127.0.0.1",
      PORT: String(port),
      MOTHERSHIP_APP_ROOT: serverDir,
      MOTHERSHIP_DATA_DIR: dataDir,
      MOTHERSHIP_PARENT_PID: String(process.pid),
      MOTHERSHIP_CLAUDE_PATH: binaries.claude,
      MOTHERSHIP_CODEX_PATH: binaries.codex,
    },
  });
  server = started;
  // Both pipes share one file, so neither may end it alone; `closeLog` does once the server is gone.
  started.stdout?.pipe(log, { end: false });
  started.stderr?.pipe(log, { end: false });
  const closeLog = () => {
    // Programs the server started can hold its pipes open after it exits; letting go of them closes the file.
    started.stdout?.destroy();
    started.stderr?.destroy();
    if (!log.writableEnded) log.end();
  };
  started.once("close", closeLog);

  let ready = false;
  started.once("exit", (code) => {
    if (server === started) server = undefined;
    setTimeout(closeLog, LOG_DRAIN_MS).unref();
    // During startup the caller reports the failure; while quitting, an exit is expected.
    if (ready && !quitting) void offerRestart(code);
  });

  // The end of its output, to tell a port another program took from any other failure.
  let output = "";
  const keepOutput = (chunk) => (output = (output + chunk).slice(-OUTPUT_TAIL_CHARS));
  started.stdout?.on("data", keepOutput);
  started.stderr?.on("data", keepOutput);

  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (quitting) throw new QuitWhileStarting();
    if (server !== started) {
      throw output.includes("EADDRINUSE") ? new PortTaken("exited") : new StartFailed("exited");
    }
    try {
      if ((await fetch(`${url}/manifest.webmanifest`, { signal: AbortSignal.timeout(POLL_TIMEOUT_MS) })).ok) {
        ready = true;
        origin = url;
        writeFileSync(serverInfoFile, JSON.stringify({ port, pid: process.pid }));
        return;
      }
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  await stopServer();
  throw new StartFailed("timeout");
}

/**
 * Starts the server on the usual port, or on any free port when another
 * program has it, including one that took it between the check and the
 * server listening. Any other failure, or a quit meanwhile, is not retried.
 */
async function startWithRetry() {
  const port = await freePort().catch(() => freePort(0));
  try {
    await startServer(port);
  } catch (error) {
    if (quitting || !(error instanceof PortTaken)) throw error;
    await startServer(await freePort(0));
  }
}

/**
 * Stops the server and everything it started, letting it record its running
 * turns as stopped by the restart first (see `stopTree` in platform.mjs).
 */
function stopServer() {
  rmSync(serverInfoFile, { force: true });
  const running = server;
  if (running?.pid === undefined) return Promise.resolve();
  return platform.stopTree(running, STOP_TIMEOUT_MS);
}

/** Names of the sessions working right now; empty when the server can't say. */
async function workingSessions() {
  if (origin === undefined) return [];
  try {
    const response = await fetch(`${origin}/api/agents/running`, { signal: AbortSignal.timeout(POLL_TIMEOUT_MS) });
    if (!response.ok) return [];
    const { running } = await response.json();
    return Array.isArray(running) ? running.map((session) => String(session.name)) : [];
  } catch {
    return [];
  }
}

/** How long a dialog waits for the page to say which language the UI is in. */
const LANGUAGE_TIMEOUT_MS = 500;

/** The dialogs' words in the UI's language, read from the page while there is one. */
async function uiText() {
  let saved;
  try {
    let timer;
    saved = await Promise.race([
      window?.webContents.executeJavaScript(`localStorage.getItem(${JSON.stringify(LOCALE_STORAGE_KEY)})`),
      new Promise((resolve) => (timer = setTimeout(resolve, LANGUAGE_TIMEOUT_MS))),
    ]).finally(() => clearTimeout(timer));
  } catch {
    // No page, or one that cannot be asked: the system's language decides.
  }
  return dialogText(dialogLanguage(saved, app.getLocale()));
}

/** What a failed start says: the server's exit or time-out in `text`'s language, any other error as it is. */
function startFailure(text, error) {
  if (error instanceof StartFailed) return error.reason === "timeout" ? text.startTimedOut(logFile) : text.exitedWhileStarting(logFile);
  return error instanceof Error ? error.message : String(error);
}

/** Whether to quit although sessions are working, asked with the app's own dialog. */
async function confirmQuit() {
  const working = await workingSessions();
  if (working.length === 0) return true;
  const text = await uiText();
  const { response } = await dialog.showMessageBox({
    type: "warning",
    message: text.working(working.length),
    detail: `${working.slice(0, 8).join("\n")}${working.length > 8 ? "\n…" : ""}\n\n${text.workingDetail}`,
    buttons: [text.quitAnyway, text.cancel],
    defaultId: 1,
    cancelId: 1,
  });
  return response === 0;
}

async function offerRestart(code) {
  const text = await uiText();
  const { response } = await dialog.showMessageBox({
    type: "error",
    message: text.serverStopped,
    detail: text.exitedWith(code, logFile),
    buttons: [text.restart, text.quit],
    defaultId: 0,
  });
  if (response !== 0) {
    app.quit();
    return;
  }
  try {
    await startWithRetry();
    if (window === undefined) openWindow();
    else void window.loadURL(origin ?? "about:blank");
  } catch (error) {
    if (!(error instanceof QuitWhileStarting)) dialog.showErrorBox(text.couldNotRestart, startFailure(text, error));
    app.quit();
  }
}

function openWindow() {
  window = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 900,
    minHeight: 600,
    title: "mothership",
    backgroundColor: "#0c0c0e",
    ...platform.windowOptions(windowIcon),
    // The built-in PDF viewer, for PDFs in the Explorer.
    webPreferences: { plugins: true },
  });
  // Links that open a new window (docs, GitHub, Slack) go to your browser.
  window.webContents.setWindowOpenHandler(({ url }) => {
    openOutside(url);
    return { action: "deny" };
  });
  // The window only ever shows the app itself; anything else opens outside it.
  const keepInside = (event, url) => {
    if (isOwn(url)) return;
    event.preventDefault();
    openOutside(url);
  };
  window.webContents.on("will-navigate", keepInside);
  window.webContents.on("will-redirect", keepInside);
  window.on("close", (event) => {
    // Closing the window quits on Windows; the quit may still be cancelled, so the window stays until it goes ahead.
    if (!platform.quitWhenWindowCloses || quitting || server === undefined) return;
    event.preventDefault();
    app.quit();
  });
  window.on("closed", () => (window = undefined));
  void window.loadURL(origin ?? "about:blank");
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (window?.isMinimized()) window.restore();
    window?.focus();
  });
  // `pnpm app:install` sends SIGTERM once sessions are done (or with --force): quit without asking.
  process.on("SIGTERM", () => {
    quitWithoutAsking = true;
    app.quit();
  });
  app.on("before-quit", (event) => {
    if (quitting || server === undefined) return;
    // Let the server and its agents stop before the app goes.
    event.preventDefault();
    if (confirming) return;
    confirming = true;
    void (quitWithoutAsking ? Promise.resolve(true) : confirmQuit())
      .then((ok) => {
        if (!ok) return;
        quitting = true;
        return stopServer().then(() => app.quit());
      })
      .finally(() => (confirming = false));
  });
  // On a Mac closing the window keeps mothership (and running agents) going; on Windows it quits.
  app.on("window-all-closed", () => {
    if (platform.quitWhenWindowCloses) app.quit();
  });
  app.on("activate", () => {
    if (window === undefined && origin !== undefined) openWindow();
  });
  if (platform.appUserModelId !== undefined) app.setAppUserModelId(platform.appUserModelId);
  app.whenReady().then(async () => {
    session.defaultSession.setPermissionRequestHandler((_contents, permission, callback, details) =>
      callback(ALLOWED_PERMISSIONS.has(permission) && isOwn(details.requestingUrl)),
    );
    session.defaultSession.setPermissionCheckHandler((_contents, permission, requestingOrigin) =>
      ALLOWED_PERMISSIONS.has(permission) && isOwn(requestingOrigin),
    );
    try {
      await startWithRetry();
      openWindow();
    } catch (error) {
      if (!(error instanceof QuitWhileStarting)) {
        const text = await uiText();
        dialog.showErrorBox(text.couldNotStart, startFailure(text, error));
      }
      quitting = true;
      app.quit();
    }
  });
}
