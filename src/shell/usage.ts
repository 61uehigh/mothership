import type { EntryPath, FeatureUse, UsageBatch } from "@/features/insights/model/Insights";
import { localDay } from "@/lib/dates";
import { en, ko, type MessageKey } from "@/ui/i18n/messages";

/** How often active time is counted and what was recorded is sent. */
const TICK_MS = 15_000;
/** With no input for this long, you are away: the time stops counting. */
const IDLE_MS = 60_000;
/** A click or key this recent is what led to a tab opening. */
const ENTRY_WINDOW_MS = 1_000;
/** Pointer moves update the area you are looking at at most this often. */
const MOVE_THROTTLE_MS = 2_000;

/**
 * ### USAGE_AREA_ATTRIBUTE
 *
 * The attribute that names a screen area for usage, e.g. `sidebar:slack`, `tab:pr`, `titlebar`.
 */
export const USAGE_AREA_ATTRIBUTE = "data-usage-area";

let queue: Array<FeatureUse> = [];
/** Active seconds by `day|area`, not yet sent. */
const active = new Map<string, number>();
/** Set by the command center, shortcuts, links, and notifications just before they open something. */
let entry: { via: EntryPath; at: number } | undefined;
let lastPointer: { area: string; at: number } | undefined;
let lastInputAt = 0;
let lastArea = "other";
let lastMoveAt = 0;
let lastOpenAt = 0;
let started = false;

function areaOf(target: EventTarget | null): string {
  return target instanceof Element ? (target.closest(`[${USAGE_AREA_ATTRIBUTE}]`)?.getAttribute(USAGE_AREA_ATTRIBUTE) ?? "other") : "other";
}

function viaOfArea(area: string): EntryPath {
  const prefix = area.split(":")[0];
  if (prefix === "sidebar" || prefix === "titlebar" || prefix === "statusbar") return prefix;
  if (prefix === "tab" || prefix === "tabs" || prefix === "details") return "tab";
  return "other";
}

function push(use: Omit<FeatureUse, "at" | "day">) {
  const at = Date.now();
  queue.push({ ...use, at, day: localDay(at) });
}

/** Where the use came from: an entry marked just now, else the area last clicked. */
function source(): { via: EntryPath; area: string } {
  const now = Date.now();
  const pointer = lastPointer !== undefined && now - lastPointer.at < ENTRY_WINDOW_MS ? lastPointer : undefined;
  if (entry !== undefined && now - entry.at < ENTRY_WINDOW_MS) return { via: entry.via, area: pointer?.area ?? entry.via };
  if (pointer !== undefined) return { via: viaOfArea(pointer.area), area: pointer.area };
  return { via: "other", area: "other" };
}

/**
 * ### markEntry
 *
 * Says how the next thing opened was reached (the command center, a shortcut,
 * a link, a notification). Call it right before opening.
 */
export function markEntry(via: EntryPath): void {
  entry = { via, at: Date.now() };
}

/**
 * ### recordOpen
 *
 * Records opening a feature in a tab, e.g. `pr` or `section:slack`, with how it was reached.
 */
export function recordOpen(feature: string): void {
  lastOpenAt = Date.now();
  push({ kind: "open", feature, ...source() });
}

/**
 * ### recordCommand
 *
 * Records running a command from the command center or a shortcut. A command
 * that opens a tab is counted once, as that tab.
 */
export function recordCommand(id: string, via: "palette" | "shortcut"): void {
  markEntry(via);
  const at = Date.now();
  setTimeout(() => {
    if (lastOpenAt < at) push({ kind: "command", feature: id, via, area: via });
  }, 0);
}

const squash = (text: string) => text.replace(/\s+/g, " ").trim();

let labelKeys: Map<string, MessageKey> | undefined;

/**
 * Plain (unparameterised) UI text in either language → one message key.
 * Keys that share their English text share one key, the first in the
 * catalog, so the same button counts once in English and in Korean.
 */
function keyOfLabel(label: string): MessageKey | undefined {
  if (labelKeys === undefined) {
    const byEnglish = new Map<string, MessageKey>();
    for (const key of Object.keys(en) as Array<MessageKey>) if (!byEnglish.has(en[key])) byEnglish.set(en[key], key);
    labelKeys = new Map();
    for (const catalog of [en, ko]) {
      for (const key of Object.keys(en) as Array<MessageKey>) {
        const text = squash(catalog[key]);
        const canonical = byEnglish.get(en[key]);
        if (!text.includes("{") && canonical !== undefined && !labelKeys.has(text)) labelKeys.set(text, canonical);
      }
    }
  }
  return labelKeys.get(label);
}

/**
 * ### actionFeature
 *
 * The id a button press is counted under in Insights: the control's
 * `data-usage` when it has one, else the message key of its label, so the
 * count does not split when the UI language changes. A label that is not
 * plain catalog text (a todo's or a chat partner's name in "Delete …",
 * a title) names content, not a feature, and is not recorded.
 *
 * @param usage - The control's `data-usage` attribute, if any.
 * @param label - Its accessible name or text; a trailing shortcut hint such as ` (⌘,)` is ignored.
 * @returns The id, or `undefined` to record nothing.
 */
export function actionFeature(usage: string | null, label: string): string | undefined {
  const id = usage?.trim();
  if (id !== undefined && id !== "") return id;
  const name = squash(label.replace(/\s*\(.*\)\s*$/, ""));
  return name === "" ? undefined : keyOfLabel(name);
}

/** A button press, unless it opened a tab (counted as that) or names content rather than a feature. */
function recordAction(target: EventTarget | null) {
  if (!(target instanceof Element)) return;
  const control = target.closest("button, [role=button], [data-usage]");
  if (control === null || control.getAttribute("role") === "tab") return;
  const label = control.getAttribute("aria-label") ?? control.getAttribute("title") ?? control.textContent ?? "";
  const feature = actionFeature(control.getAttribute("data-usage"), label);
  if (feature === undefined) return;
  const area = areaOf(control);
  const at = Date.now();
  setTimeout(() => {
    if (lastOpenAt < at) push({ kind: "action", feature, area, via: viaOfArea(area) });
  }, 0);
}

function batch(): UsageBatch | undefined {
  if (queue.length === 0 && active.size === 0) return undefined;
  const uses = queue;
  const slices = [...active].map(([key, seconds]) => {
    const [day, area] = key.split("|");
    return { day: day ?? "", area: area ?? "other", seconds };
  });
  queue = [];
  active.clear();
  return { uses, active: slices };
}

function send(useBeacon: boolean) {
  const body = batch();
  if (body === undefined) return;
  const json = JSON.stringify(body);
  if (useBeacon && navigator.sendBeacon(`/api/insights`, new Blob([json], { type: "application/json" }))) return;
  void fetch("/api/insights", { method: "POST", headers: { "content-type": "application/json" }, body: json, keepalive: true }).catch(() => {
    // Offline or the server restarting: these uses are lost, which is fine for statistics.
  });
}

/**
 * ### startUsageTracking
 *
 * Starts recording on this page: active time (the window in front and input
 * within the last minute, counted to the area under the pointer or focus),
 * button presses (see {@link actionFeature}), and sending what was recorded every 15 seconds
 * and when the page goes away. Everything stays on this computer.
 *
 * @returns Stops it.
 */
export function startUsageTracking(): () => void {
  if (started) return () => {};
  started = true;
  const onPointerDown = (event: PointerEvent) => {
    const area = areaOf(event.target);
    lastPointer = { area, at: Date.now() };
    lastArea = area;
    lastInputAt = Date.now();
  };
  const onClick = (event: MouseEvent) => recordAction(event.target);
  const onKeyDown = () => {
    lastInputAt = Date.now();
    lastArea = areaOf(document.activeElement);
  };
  const onMove = (event: Event) => {
    const now = Date.now();
    lastInputAt = now;
    if (now - lastMoveAt < MOVE_THROTTLE_MS) return;
    lastMoveAt = now;
    lastArea = areaOf(event.target);
  };
  const onHide = () => {
    if (document.visibilityState === "hidden") send(true);
  };
  const onPageHide = () => send(true);
  const tick = setInterval(() => {
    const now = Date.now();
    if (document.visibilityState === "visible" && document.hasFocus() && now - lastInputAt < IDLE_MS) {
      const key = `${localDay(now)}|${lastArea}`;
      active.set(key, (active.get(key) ?? 0) + TICK_MS / 1000);
    }
    send(false);
  }, TICK_MS);

  window.addEventListener("pointerdown", onPointerDown, true);
  window.addEventListener("click", onClick, true);
  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("pointermove", onMove, { capture: true, passive: true });
  window.addEventListener("wheel", onMove, { capture: true, passive: true });
  document.addEventListener("visibilitychange", onHide);
  window.addEventListener("pagehide", onPageHide);
  return () => {
    clearInterval(tick);
    window.removeEventListener("pointerdown", onPointerDown, true);
    window.removeEventListener("click", onClick, true);
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("pointermove", onMove, true);
    window.removeEventListener("wheel", onMove, true);
    document.removeEventListener("visibilitychange", onHide);
    window.removeEventListener("pagehide", onPageHide);
    started = false;
    send(true);
  };
}
