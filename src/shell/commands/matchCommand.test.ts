import { describe, expect, it } from "vitest";
import { CHORD_TIMEOUT_MS, chordPrefix, matchCommand, type KeyContext } from "@/shell/commands/matchCommand";

type Cmd = { id: string; keys: Array<string>; priority?: number };

const plain: KeyContext = { typing: false, control: false, modal: false };
const match = (commands: Array<Cmd>, step: string, context: Partial<KeyContext> = {}, prefix?: string) =>
  matchCommand(commands, (c) => c.keys, step, prefix, { ...plain, ...context });

describe("matchCommand", () => {
  it("runs the highest priority, then the most recently registered, of commands sharing a key", () => {
    const page = { id: "page.next", keys: ["j"] };
    const review = { id: "review.next", keys: ["j"], priority: 1 };
    const later = { id: "later.next", keys: ["j"] };
    expect(match([review, page], "j").match?.id).toBe("review.next");
    expect(match([page, later], "j").match?.id).toBe("later.next");
  });

  it("finishes a chord before a single-key binding of its second step", () => {
    const commands = [{ id: "go-home", keys: ["g h"] }, { id: "help", keys: ["h"] }];
    expect(match(commands, "h", {}, "g").match?.id).toBe("go-home");
    expect(match(commands, "h").match?.id).toBe("help");
  });

  it("keeps a chord's first step for the next press, but not while typing or in a dialog", () => {
    const commands = [{ id: "go-home", keys: ["g h"] }];
    expect(match(commands, "g")).toEqual({ match: undefined, startsChord: true });
    expect(match(commands, "g", { typing: true }).startsChord).toBe(false);
    expect(match(commands, "g", { modal: true }).startsChord).toBe(false);
  });

  it("ignores single keys while typing, but not mod or alt bindings", () => {
    const commands = [{ id: "new", keys: ["c"] }, { id: "palette", keys: ["mod+k"] }];
    expect(match(commands, "c", { typing: true }).match).toBeUndefined();
    expect(match(commands, "mod+k", { typing: true }).match?.id).toBe("palette");
  });

  it("passes only mod and alt bindings in a dialog, leaving Esc to the dialog", () => {
    const commands = [{ id: "new", keys: ["c"] }, { id: "close", keys: ["escape"] }, { id: "palette", keys: ["mod+k"] }];
    expect(match(commands, "c", { modal: true }).match).toBeUndefined();
    expect(match(commands, "escape", { modal: true }).match).toBeUndefined();
    expect(match(commands, "mod+k", { modal: true }).match?.id).toBe("palette");
  });

  it("leaves Enter, Space, and arrows on a focused control to that control", () => {
    const commands = [{ id: "open", keys: ["enter"] }, { id: "down", keys: ["down"] }, { id: "new", keys: ["c"] }];
    expect(match(commands, "enter", { control: true }).match).toBeUndefined();
    expect(match(commands, "down", { control: true }).match).toBeUndefined();
    expect(match(commands, "c", { control: true }).match?.id).toBe("new");
    expect(match(commands, "enter").match?.id).toBe("open");
  });
});

describe("chordPrefix", () => {
  it("keeps the first step only within the chord timeout", () => {
    expect(chordPrefix({ step: "g", at: 1_000 }, 1_000 + CHORD_TIMEOUT_MS - 1)).toBe("g");
    expect(chordPrefix({ step: "g", at: 1_000 }, 1_000 + CHORD_TIMEOUT_MS)).toBeUndefined();
    expect(chordPrefix(undefined, 1_000)).toBeUndefined();
  });
});
