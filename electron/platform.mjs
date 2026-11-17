// What the desktop app does differently per operating system: where the
// bundled agent binaries are, how the server is started and stopped, and how
// the window looks. main.mjs picks one with `currentPlatform()`.
import { execFile } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, rmSync, symlinkSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
/** What the server listens for on its IPC channel on Windows (see `listenForShutdown` in src/instrumentation-node.ts). */
const SHUTDOWN_MESSAGE = "mothership:shutdown";

/** Resolves when `child` has exited, at once if it already has. */
function exited(child) {
  return child.exitCode !== null || child.signalCode !== null ? Promise.resolve() : new Promise((resolve) => child.once("exit", resolve));
}

/** How long what the server leaves behind gets after SIGTERM before it is killed. */
const GROUP_GRACE_MS = 2_000;
const GROUP_POLL_MS = 100;

/** Whether any process of the group is still running. */
function groupAlive(pid) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Sends `signal` to a whole process group: the server, its agents, and their tools. */
function signalGroup(pid, signal) {
  try {
    process.kill(-pid, signal);
  } catch {
    // Already gone.
  }
}

/**
 * macOS (and other POSIX systems). The server runs in its own process group,
 * so one signal reaches everything it started.
 */
const posix = {
  binaries: (resources) => ({ claude: path.join(resources, "bin", "claude"), codex: path.join(resources, "codex", "bin", "codex") }),

  /**
   * Apps opened from Finder get a minimal PATH, without Homebrew, nvm, or other
   * tools your shell adds, so ask your login shell for its PATH once. `printenv`
   * prints it the same way in every shell (fish joins `$PATH` with spaces).
   */
  async loginPath() {
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
  },

  // The server ships with its pnpm symlinks.
  prepareServer: () => {},

  // Its own process group, so quitting stops the server and everything it started.
  spawnOptions: { detached: true, stdio: ["ignore", "pipe", "pipe"] },

  /**
   * Stops the server first, alone, so it records its running turns as stopped
   * by the restart (they can be continued later) and stops its agents itself;
   * signalling the agents at the same moment would make them end as failed.
   * Then whatever it started that is left gets SIGTERM, and is killed if it
   * is still there {@link GROUP_GRACE_MS} later. A server still running after
   * `timeoutMs` is killed with its whole group at once.
   */
  async stopTree(child, timeoutMs) {
    const pid = child.pid;
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // Exited already.
    }
    let timer;
    const stopped = await Promise.race([
      exited(child).then(() => true),
      new Promise((resolve) => (timer = setTimeout(() => resolve(false), timeoutMs))),
    ]);
    clearTimeout(timer);
    if (!stopped) {
      signalGroup(pid, "SIGKILL");
      return;
    }
    signalGroup(pid, "SIGTERM");
    const deadline = Date.now() + GROUP_GRACE_MS;
    while (groupAlive(pid)) {
      if (Date.now() >= deadline) {
        signalGroup(pid, "SIGKILL");
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, GROUP_POLL_MS));
    }
  },

  // No native title bar: the close, minimize, and zoom buttons sit in the app's own
  // 40px header (centered on it), as in other Mac apps. The title stays for Mission Control.
  windowOptions: () => ({ titleBarStyle: "hidden", trafficLightPosition: { x: 14, y: 13 } }),

  // Like other Mac apps, closing the window keeps mothership (and running agents) going.
  quitWhenWindowCloses: false,

  // macOS knows the app by its bundle id.
  appUserModelId: undefined,
};

/**
 * ### parseWindowsProcesses
 *
 * Reads the `pid parent created` lines `windowsProcesses` prints. `created`
 * is the creation time as a Windows file time, kept as a digit string since
 * it does not fit a double. With the pid it names one process: Windows hands
 * a freed pid to the next program quickly.
 *
 * @returns One entry per well-formed line; other lines are skipped.
 */
export function parseWindowsProcesses(stdout) {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/))
    .filter((fields) => fields.length === 3 && fields.every((field) => /^\d+$/.test(field)))
    .map(([pid, parent, created]) => ({ pid: Number(pid), parent: Number(parent), created }));
}

/** Every running process, from PowerShell (wmic is gone from current Windows). */
async function windowsProcesses() {
  const { stdout } = await run(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "Get-CimInstance Win32_Process | ForEach-Object { \"$($_.ProcessId) $($_.ParentProcessId) $($_.CreationDate.ToFileTimeUtc())\" }",
    ],
    { windowsHide: true, timeout: 10_000 },
  );
  return parseWindowsProcesses(stdout);
}

/** Whether file time `a` is before `b`, both digit strings. */
function earlier(a, b) {
  return a.length !== b.length ? a.length < b.length : a < b;
}

/**
 * ### windowsTree
 *
 * The process `rootPid` in one snapshot, the processes it started, and
 * theirs. A process created before the one its parent pid points at is left
 * out: its real parent exited and the pid went to an unrelated program.
 *
 * @returns The root first, then its descendants; empty when the root is not in the snapshot.
 */
export function windowsTree(processes, rootPid) {
  const root = processes.find((p) => p.pid === rootPid);
  if (root === undefined) return [];
  const children = new Map();
  for (const p of processes) {
    if (p.pid === p.parent) continue;
    children.set(p.parent, [...(children.get(p.parent) ?? []), p]);
  }
  const found = [root];
  for (let i = 0; i < found.length; i++) {
    const parent = found[i];
    for (const child of children.get(parent.pid) ?? []) {
      if (earlier(child.created, parent.created) || found.some((p) => p.pid === child.pid)) continue;
      found.push(child);
    }
  }
  return found;
}

/**
 * ### stillOurs
 *
 * What to kill of the processes `recorded` before the stop, looked up again
 * in `current`: each one still running as the same process (same pid and
 * creation time), and what it has started since. A recorded pid now held by
 * another program is left alone, with everything that program started.
 *
 * @returns The pids, each once.
 */
export function stillOurs(recorded, current) {
  const pids = new Set();
  for (const process of recorded) {
    if (!current.some((p) => p.pid === process.pid && p.created === process.created)) continue;
    for (const p of windowsTree(current, process.pid)) pids.add(p.pid);
  }
  return [...pids];
}

/**
 * `taskkill /F` on exactly these pids; ones already gone are skipped. Not
 * `/T`, which follows parent pids that may have been reused: the
 * descendants are in the list already.
 */
async function windowsKill(pids) {
  if (pids.length === 0) return;
  await run("taskkill.exe", ["/F", ...pids.flatMap((pid) => ["/PID", String(pid)])], { windowsHide: true }).catch(() => {
    // Some had exited already.
  });
}

/**
 * Makes the server's pnpm links (listed by electron/build.mjs in
 * `server-links.json`, as the installer cannot carry links) as directory
 * junctions, which need no administrator rights. Runs at every start, so a
 * link left from another install folder is fixed; ones already right are kept.
 */
function windowsServerLinks(resources) {
  const list = path.join(resources, "server-links.json");
  if (!existsSync(list)) return;
  const server = path.join(resources, "server");
  for (const { link, target } of JSON.parse(readFileSync(list, "utf8"))) {
    const at = path.join(server, ...link.split("/"));
    const to = path.join(server, ...target.split("/"));
    try {
      if (path.resolve(path.dirname(at), readlinkSync(at)) === to) continue;
    } catch {
      // Not a link yet.
    }
    if (existsSync(at) || isLink(at)) rmSync(at, { recursive: true, force: true });
    mkdirSync(path.dirname(at), { recursive: true });
    symlinkSync(to, at, "junction");
  }
}

function isLink(file) {
  try {
    return lstatSync(file).isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Windows. There are no process groups or termination signals (killing is
 * immediate), so the server is asked to stop over an IPC channel, and the
 * agents it started, which outlive it on Windows, are stopped afterwards.
 */
const windows = {
  binaries: (resources) => ({ claude: path.join(resources, "bin", "claude.exe"), codex: path.join(resources, "codex", "bin", "codex.exe") }),

  // Apps started from the Start menu get your full PATH. It is `Path` there, so it is left alone.
  loginPath: async () => undefined,

  prepareServer: windowsServerLinks,

  spawnOptions: { detached: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe", "ipc"] },

  /**
   * Notes what the server started, asks it to stop (it records running turns
   * as stopped by the restart, like on SIGTERM), then stops what is left of
   * those processes, checked with {@link stillOurs} so a reused pid is never
   * killed; after `timeoutMs` the server itself is killed too.
   */
  async stopTree(child, timeoutMs) {
    const started = await windowsProcesses()
      .then((processes) => windowsTree(processes, child.pid).slice(1))
      .catch(() => []);
    try {
      child.send(SHUTDOWN_MESSAGE);
    } catch {
      // The channel is closed: the server is exiting already.
    }
    let timer;
    const stopped = await Promise.race([
      exited(child).then(() => true),
      new Promise((resolve) => (timer = setTimeout(() => resolve(false), timeoutMs))),
    ]);
    clearTimeout(timer);
    // Through its handle, which a reused pid cannot fool.
    if (!stopped) child.kill();
    // Looked up again: a pid that exited during the wait may belong to another program by now.
    const current = await windowsProcesses().catch(() => []);
    await windowsKill(stillOurs(started, current));
  },

  // The native title bar, with its own buttons; the app's header below it is then only a toolbar.
  windowOptions: (icon) => ({ autoHideMenuBar: true, ...(icon === undefined ? {} : { icon }) }),

  // Without a Dock to reopen it from, closing the window quits (asking first while sessions work).
  quitWhenWindowCloses: true,

  // Windows matches notifications to the Start menu shortcut by this id (electron-builder sets it to the appId).
  appUserModelId: "io.github.61uehigh.mothership",
};

/**
 * ### currentPlatform
 *
 * What differs per OS, for `main.mjs`: Windows, or POSIX (macOS) for
 * everything else. One object, so main.mjs never checks the OS itself.
 *
 * @returns The `windows` or `posix` table: binaries, login PATH, spawning and
 *   stopping the server, window options, whether closing the window quits, and
 *   the Windows app id.
 */
export function currentPlatform() {
  return process.platform === "win32" ? windows : posix;
}
