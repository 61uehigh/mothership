import { afterEach, describe, expect, it, vi } from "vitest";
import { eventToStep, formatBinding, hasModifier, readKeyOverridesResponse } from "@/shell/commands/keys";

/** A key press as the browser reports it; tests run outside a browser, so the platform comes from the env. */
const press = (fields: Partial<KeyboardEvent>) => ({ code: "", key: "", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...fields }) as KeyboardEvent;
const onPlatform = (platform: string) => vi.stubEnv("MOTHERSHIP_TARGET_PLATFORM", platform);

afterEach(() => vi.unstubAllEnvs());

describe("eventToStep", () => {
  it("reads the physical key, so a Korean layout still gives the Latin binding", () => {
    onPlatform("darwin");
    expect(eventToStep(press({ code: "KeyG", key: "ㅎ" }))).toBe("g");
    expect(eventToStep(press({ code: "Digit1", key: "!", shiftKey: true }))).toBe("shift+1");
    expect(eventToStep(press({ code: "Slash", key: "?", shiftKey: true }))).toBe("shift+/");
  });

  it("maps mod to ⌘ on a Mac and to Ctrl elsewhere", () => {
    onPlatform("darwin");
    expect(eventToStep(press({ code: "KeyK", metaKey: true }))).toBe("mod+k");
    expect(eventToStep(press({ code: "KeyK", ctrlKey: true }))).toBe("k");
    onPlatform("win32");
    expect(eventToStep(press({ code: "KeyK", ctrlKey: true, altKey: true }))).toBe("mod+alt+k");
    expect(eventToStep(press({ code: "KeyK", metaKey: true }))).toBe("k");
  });

  it("falls back to the character when there is no code, mapping a shifted symbol to its key", () => {
    onPlatform("darwin");
    expect(eventToStep(press({ code: "", key: "?", shiftKey: true }))).toBe("shift+/");
    expect(eventToStep(press({ code: "Unidentified", key: "J" }))).toBe("j");
  });

  it("gives nothing for a bare modifier or an unnamed key", () => {
    onPlatform("darwin");
    expect(eventToStep(press({ code: "MetaLeft", key: "Meta", metaKey: true }))).toBeUndefined();
    expect(eventToStep(press({ code: "F13", key: "F13" }))).toBeUndefined();
  });
});

describe("hasModifier", () => {
  it("is true when the first step uses mod or alt, or is Escape", () => {
    expect(hasModifier("mod+k")).toBe(true);
    expect(hasModifier("alt+w")).toBe(true);
    expect(hasModifier("escape")).toBe(true);
    expect(hasModifier("g h")).toBe(false);
    expect(hasModifier("shift+/")).toBe(false);
    expect(hasModifier("g mod+k")).toBe(false);
  });
});

describe("formatBinding", () => {
  it("writes Mac symbols without separators on a Mac", () => {
    onPlatform("darwin");
    expect(formatBinding("mod+shift+p")).toBe("⌘⇧P");
    expect(formatBinding("g h")).toBe("G → H");
    expect(formatBinding("mod+enter")).toBe("⌘↵");
  });

  it("writes key names joined by + elsewhere", () => {
    onPlatform("win32");
    expect(formatBinding("mod+alt+b")).toBe("Ctrl+Alt+B");
    expect(formatBinding("escape")).toBe("Esc");
  });
});

describe("readKeyOverridesResponse", () => {
  it("reads command ids and their keys", () => {
    expect(readKeyOverridesResponse({ overrides: { "tabs.close": ["mod+w"], "app.palette": [] } })).toEqual({ "tabs.close": ["mod+w"], "app.palette": [] });
  });

  it("refuses an error body or a broken shape, which would break every shortcut", () => {
    expect(readKeyOverridesResponse({ error: "Something went wrong" })).toBeUndefined();
    expect(readKeyOverridesResponse({ overrides: null })).toBeUndefined();
    expect(readKeyOverridesResponse({ overrides: [["mod+w"]] })).toBeUndefined();
    expect(readKeyOverridesResponse({ overrides: { "tabs.close": "mod+w" } })).toBeUndefined();
    expect(readKeyOverridesResponse("<html>")).toBeUndefined();
  });
});
