// The desktop app: starts mothership's server with Electron's own Node, then
// shows it in a window. Your data lives in Application Support, apart from the
// app, so updates never touch it.
import { execFile, spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, statSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { parseEnv, promisify } from "node:util";
import { app, BrowserWindow, dialog, session, shell } from "electron";

const run = promisify(execFile);
const STARTUP_TIMEOUT_MS = 60_000;
const STOP_TIMEOUT_MS = 5_000;
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
const dataDir = app.getPath("userData");
// Chromium's caches go in their own folder, so your data folder holds only your data.
app.setPath("sessionData", path.join(dataDir, "Chromium"));
const logFile = path.join(dataDir, "logs", "server.log");

/** @type {import("node:child_process").ChildProcess | undefined} */
let server;
/** @type {string | undefined} */
let origin;
/** @type {BrowserWindow | undefined} */
let window;
let quitting = false;

/** {@link PREFERRED_PORT} when it is free, else any free port on this Mac. */
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

/**
 * Apps opened from Finder get a minimal PATH, without Homebrew, nvm, or other
 * tools your shell adds, so ask your login shell for its PATH once. `printenv`
 * prints it the same way in every shell (fish joins `$PATH` with spaces).
 */
async function shellPath() {
  const fallback = [process.env.PATH, "/opt/homebrew/bin", "/usr/local/bin"].filter(Boolean).join(":");
  try {
    const { stdout } = await run(process.env.SHELL || "/bin/zsh", ["-ilc", "printf '__PATH__'; /usr/bin/printenv PATH"], { timeout: 10_000 });
    // Profiles may print their own text before or after; take the line right after the marker.
    const found = stdout.split("__PATH__").at(-1)?.split("\n")[0]?.trim();
    if (found !== undefined && found.includes("/")) return found;
  } catch {
    // A broken shell profile should not stop the app; fall back below.
  }
  return fallback;
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
  const started = spawn(process.execPath, [path.join(serverDir, "server.js")], {
    cwd: serverDir,
    // Its own process group, so quitting stops the server and everything it started.
    detached: true,
    env: {
      ...process.env,
      ...savedSecrets(),
      PATH: await shellPath(),
      // Run Electron's binary as plain Node; the server clears this for the programs it starts.
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      HOSTNAME: "127.0.0.1",
      PORT: String(port),
      MOTHERSHIP_APP_ROOT: serverDir,
      MOTHERSHIP_DATA_DIR: dataDir,
      MOTHERSHIP_PARENT_PID: String(process.pid),
      MOTHERSHIP_CLAUDE_PATH: path.join(resources, "bin", "claude"),
      MOTHERSHIP_CODEX_PATH: path.join(resources, "codex", "bin", "codex"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server = started;
  started.stdout?.pipe(log);
  started.stderr?.pipe(log);

  let ready = false;
  started.once("exit", (code) => {
    if (server === started) server = undefined;
    // During startup the caller reports the failure; while quitting, an exit is expected.
    if (ready && !quitting) void offerRestart(code);
  });

  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (server !== started) throw new Error(`The server exited while starting. Details are in ${logFile}.`);
    try {
      if ((await fetch(`${url}/manifest.webmanifest`)).ok) {
        ready = true;
        origin = url;
        return;
      }
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  stopServer();
  throw new Error(`The server did not start within a minute. Details are in ${logFile}.`);
}

/** Starts the server on the usual port, and on any free port if that fails (another program took it). */
async function startWithRetry() {
  try {
    await startServer(await freePort());
  } catch {
    await startServer(await freePort(0));
  }
}

/** Stops the server's whole process group: the server, its agents, and their tools. */
function stopServer() {
  const running = server;
  if (running?.pid === undefined) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      try {
        process.kill(-running.pid, "SIGKILL");
      } catch {
        // Already gone.
      }
      resolve();
    }, STOP_TIMEOUT_MS);
    running.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    try {
      process.kill(-running.pid, "SIGTERM");
    } catch {
      clearTimeout(timer);
      resolve();
    }
  });
}

async function offerRestart(code) {
  const { response } = await dialog.showMessageBox({
    type: "error",
    message: "mothership's server stopped",
    detail: `It exited with code ${code}. Details are in ${logFile}.`,
    buttons: ["Restart", "Quit"],
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
    dialog.showErrorBox("mothership could not restart", error instanceof Error ? error.message : String(error));
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
  app.on("before-quit", (event) => {
    if (quitting || server === undefined) return;
    // Let the server and its agents stop before the app goes.
    quitting = true;
    event.preventDefault();
    void stopServer().then(() => app.quit());
  });
  // Like other Mac apps, closing the window keeps mothership (and running agents) going.
  app.on("window-all-closed", () => {});
  app.on("activate", () => {
    if (window === undefined && origin !== undefined) openWindow();
  });
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
      dialog.showErrorBox("mothership could not start", error instanceof Error ? error.message : String(error));
      quitting = true;
      app.quit();
    }
  });
}
