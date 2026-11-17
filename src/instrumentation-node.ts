const PARENT_CHECK_MS = 2_000;

/**
 * ### clearElectronRunAsNode
 *
 * The desktop app runs this server with Electron's binary as Node
 * (`ELECTRON_RUN_AS_NODE`). Programs started from here inherit the
 * environment, and an Electron app among them (VS Code, Docker Desktop)
 * would then start as plain Node and show no window, so the switch is
 * cleared before any route runs. The control MCP server, which also runs
 * Electron's binary, sets it again for itself.
 */
export function clearElectronRunAsNode(): void {
  delete process.env.ELECTRON_RUN_AS_NODE;
}

/**
 * ### watchParent
 *
 * In the desktop app, exits the server if the app that started it is gone (a
 * crash or force quit), so it never keeps running agents and holding the
 * port with no window to show them.
 */
export function watchParent(): void {
  const parent = Number(process.env.MOTHERSHIP_PARENT_PID);
  if (!Number.isInteger(parent) || parent <= 0) return;
  const timer = setInterval(() => {
    try {
      // Signal 0 only checks that the process exists.
      process.kill(parent, 0);
    } catch {
      console.error("[mothership] the desktop app is gone; stopping the server");
      process.exit(0);
    }
  }, PARENT_CHECK_MS);
  timer.unref();
}

/** What the Windows desktop app sends over the IPC channel to stop the server. */
const SHUTDOWN_MESSAGE = "mothership:shutdown";
/** How long Next gets to close after the stop before the server exits anyway. */
const SHUTDOWN_GRACE_MS = 5_000;

/**
 * ### listenForShutdown
 *
 * Windows has no SIGTERM to send another process (killing it is immediate),
 * so the desktop app there asks the server to stop over an IPC channel. The
 * server then runs its SIGTERM handlers as if signalled, which record running
 * turns as stopped by the restart and let Next close. Acts only on the
 * desktop app's own message, so another channel (such as one a dev server
 * may open to its worker) is left alone.
 */
export function listenForShutdown(): void {
  if (process.send === undefined) return;
  process.on("message", (message) => {
    if (message !== SHUTDOWN_MESSAGE) return;
    console.error("[mothership] the desktop app asked the server to stop");
    process.emit("SIGTERM", "SIGTERM");
    setTimeout(() => process.exit(0), SHUTDOWN_GRACE_MS);
  });
}
