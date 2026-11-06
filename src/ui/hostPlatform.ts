/**
 * ### PLATFORM_ATTRIBUTE
 *
 * The `<html>` attribute `layout.tsx` renders with {@link serverPlatform}, so
 * the browser reads the same platform the server rendered with.
 */
export const PLATFORM_ATTRIBUTE = "data-platform";

/**
 * ### serverPlatform
 *
 * The OS the server renders for: `MOTHERSHIP_TARGET_PLATFORM` when
 * `pnpm app:build` sets it (the page is prerendered at build time, and a
 * Windows installer can be built on a Mac), else the OS the server runs on.
 * The app's server and window always run on the same computer.
 *
 * @returns A Node `process.platform` value such as `darwin` or `win32`.
 */
export function serverPlatform(): string {
  return process.env.MOTHERSHIP_TARGET_PLATFORM ?? process.platform;
}

/**
 * ### hostPlatform
 *
 * The OS of the computer the app runs on, the same in server rendering and
 * in the browser's first render, so labels that depend on it (⌘ or Ctrl,
 * Finder or File Explorer) never mismatch during hydration. A page without
 * the attribute (an old cached page) falls back to the browser's user agent.
 *
 * @returns A Node `process.platform` value such as `darwin` or `win32`.
 */
export function hostPlatform(): string {
  if (typeof window === "undefined") return serverPlatform();
  const rendered = document.documentElement.getAttribute(PLATFORM_ATTRIBUTE);
  if (rendered !== null && rendered !== "") return rendered;
  if (/Mac|iPhone|iPad/.test(navigator.userAgent)) return "darwin";
  return /Windows/.test(navigator.userAgent) ? "win32" : "linux";
}

/**
 * ### TRAFFIC_LIGHTS_ATTRIBUTE
 *
 * The `<html>` attribute {@link TRAFFIC_LIGHTS_SCRIPT} sets in the Mac
 * desktop app, whose window draws its close, minimize, and zoom buttons over
 * the left end of the app's own title bar; only there does the title bar
 * keep room for them.
 */
export const TRAFFIC_LIGHTS_ATTRIBUTE = "data-traffic-lights";

/**
 * ### TRAFFIC_LIGHTS_SCRIPT
 *
 * Runs before first paint: marks the Mac desktop app with
 * {@link TRAFFIC_LIGHTS_ATTRIBUTE}. Read from the user agent, since the page
 * is prerendered and the same page serves browsers, which have no such buttons.
 */
export const TRAFFIC_LIGHTS_SCRIPT = `if(/Electron\\//.test(navigator.userAgent)&&/Mac/.test(navigator.userAgent))document.documentElement.setAttribute("${TRAFFIC_LIGHTS_ATTRIBUTE}","")`;
