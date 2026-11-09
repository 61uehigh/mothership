import { describe, expect, it } from "vitest";
import { followUpTodo, newTodoSchema, TODO_TITLE_MAX } from "./Todos";

const wordDue = (what: string, due: string) => `${what} (due ${due})`;

describe("followUpTodo", () => {
  it("makes a due date that is a real day the to-do's", () => {
    expect(followUpTodo({ what: "Send the deck", due: "2026-12-01" }, wordDue)).toEqual({ text: "Send the deck", due: "2026-12-01" });
  });

  it("keeps an impossible date in the text", () => {
    expect(followUpTodo({ what: "Send the deck", due: "2026-11-31" }, wordDue)).toEqual({ text: "Send the deck (due 2026-11-31)" });
    expect(followUpTodo({ what: "Send the deck", due: "2026-13-01" }, wordDue)).toEqual({ text: "Send the deck (due 2026-13-01)" });
  });

  it("keeps a vague due date in the text", () => {
    expect(followUpTodo({ what: "Send the deck", due: "next week" }, wordDue)).toEqual({ text: "Send the deck (due next week)" });
  });

  it("treats an empty due date as none", () => {
    expect(followUpTodo({ what: "Send the deck", due: "" }, wordDue)).toEqual({ text: "Send the deck" });
  });

  it("cuts the title to the to-do limit, a vague due date included", () => {
    const what = "x".repeat(TODO_TITLE_MAX);
    expect(followUpTodo({ what }, wordDue)?.text).toHaveLength(TODO_TITLE_MAX);
    expect(followUpTodo({ what, due: "soon" }, wordDue)?.text).toHaveLength(TODO_TITLE_MAX);
  });

  it("offers nothing for an empty follow-up", () => {
    expect(followUpTodo({ what: "  ", due: "2026-12-01" }, wordDue)).toBeUndefined();
  });

  it("always builds a to-do the schema accepts", () => {
    for (const due of [undefined, "", "2026-12-01", "2026-11-31", "tomorrow"]) {
      const todo = followUpTodo({ what: "y".repeat(TODO_TITLE_MAX + 50), due }, wordDue);
      expect(newTodoSchema.safeParse(todo).success).toBe(true);
    }
  });
});
