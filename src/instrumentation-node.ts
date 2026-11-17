const PARENT_CHECK_MS = 2_000;

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
