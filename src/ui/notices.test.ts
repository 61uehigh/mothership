import { describe, expect, it } from "vitest";
import { addNotice, type Notice } from "@/ui/notices";

describe("addNotice", () => {
  it("adds a new message at the end", () => {
    const list = addNotice(addNotice([], "a", 1), "b", 2);
    expect(list.map((n) => n.message)).toEqual(["a", "b"]);
  });

  it("counts a repeated message once, moved to the end with the new id", () => {
    const list = addNotice(addNotice(addNotice([], "a", 1), "b", 2), "a", 3);
    expect(list).toEqual<Array<Notice>>([
      { id: 2, message: "b", count: 1 },
      { id: 3, message: "a", count: 2 },
    ]);
  });

  it("keeps only the newest", () => {
    let list: Array<Notice> = [];
    for (let i = 1; i <= 5; i++) list = addNotice(list, `m${i}`, i, 3);
    expect(list.map((n) => n.id)).toEqual([3, 4, 5]);
  });
});
