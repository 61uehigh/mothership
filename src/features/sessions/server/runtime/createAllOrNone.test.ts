import { describe, expect, it } from "vitest";
import { createAllOrNone } from "@/features/sessions/server/runtime/createAllOrNone";

describe("createAllOrNone", () => {
  it("creates in order and starts only once every one exists", async () => {
    const log: Array<string> = [];
    const created = await createAllOrNone(
      ["a", "b"],
      async (input, index) => {
        log.push(`create ${input}${index}`);
        return input.toUpperCase();
      },
      async () => undefined,
      (all) => log.push(`start ${all.join(",")}`),
    );
    expect(created).toEqual(["A", "B"]);
    expect(log).toEqual(["create a0", "create b1", "start A,B"]);
  });

  it("undoes the ones made before a failure, never starts any, and reports the failure", async () => {
    const undone: Array<string> = [];
    let started = false;
    const run = createAllOrNone(
      ["a", "b", "c"],
      async (input) => {
        if (input === "c") throw new Error("not a git repository");
        return input;
      },
      async (item) => {
        undone.push(item);
      },
      () => {
        started = true;
      },
    );
    await expect(run).rejects.toThrow("not a git repository");
    expect(undone).toEqual(["a", "b"]);
    expect(started).toBe(false);
  });

  it("keeps undoing the rest when one undo fails, and still reports the original failure", async () => {
    const undone: Array<string> = [];
    const run = createAllOrNone(
      ["a", "b", "c"],
      async (input) => {
        if (input === "c") throw new Error("limit reached");
        return input;
      },
      async (item) => {
        if (item === "a") throw new Error("worktree busy");
        undone.push(item);
      },
    );
    await expect(run).rejects.toThrow("limit reached");
    expect(undone).toEqual(["b"]);
  });

  it("undoes every one when starting them fails", async () => {
    const undone: Array<string> = [];
    const run = createAllOrNone(
      ["a", "b"],
      async (input) => input,
      async (item) => {
        undone.push(item);
      },
      () => {
        throw new Error("unknown session");
      },
    );
    await expect(run).rejects.toThrow("unknown session");
    expect(undone).toEqual(["a", "b"]);
  });
});
