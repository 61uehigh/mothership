import { describe, expect, it } from "vitest";
import type { Todo } from "@/features/todos/model/Todos";
import { todoKey, todoKeyChange } from "@/features/todos/ui/todoKeys";

function press(code: string, key: string, modifiers: Partial<Pick<KeyboardEvent, "shiftKey" | "metaKey" | "ctrlKey" | "altKey">> = {}): KeyboardEvent {
  return { code, key, shiftKey: false, metaKey: false, ctrlKey: false, altKey: false, ...modifiers } as KeyboardEvent;
}

describe("todoKey", () => {
  it("reads the physical key, so the Korean input source still checks a to-do off", () => {
    expect(todoKey(press("KeyX", "ㅌ"))).toBe("done");
    expect(todoKey(press("KeyJ", "ㅓ"))).toBe("next");
    expect(todoKey(press("KeyZ", "ㅋ"))).toBe("undo");
  });

  it("maps the arrows and brackets, and falls back to the character when there is no code", () => {
    expect(todoKey(press("ArrowUp", "ArrowUp"))).toBe("previous");
    expect(todoKey(press("BracketRight", "]"))).toBe("nextDay");
    expect(todoKey(press("", "c"))).toBe("copyStandup");
  });

  it("ignores a shifted key and keys with no shortcut", () => {
    expect(todoKey(press("KeyX", "X", { shiftKey: true }))).toBeUndefined();
    expect(todoKey(press("KeyQ", "q"))).toBeUndefined();
  });
});

describe("todoKeyChange", () => {
  const todo: Todo = { id: "a", text: "Write it", body: "", done: false, carryCount: 0, blocked: true, createdAt: 0, doneDayOnly: false };

  it("toggles done and blocked and plans the next workday past a weekend", () => {
    expect(todoKeyChange("done", todo, "2026-11-27")).toEqual({ done: true });
    expect(todoKeyChange("blocked", todo, "2026-11-27")).toEqual({ blocked: false });
    expect(todoKeyChange("nextWorkday", todo, "2026-11-27")).toEqual({ plannedFor: "2026-11-30" });
    expect(todoKeyChange("next", todo, "2026-11-27")).toBeUndefined();
  });
});
