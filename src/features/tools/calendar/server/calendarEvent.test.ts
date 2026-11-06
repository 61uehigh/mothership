import { describe, expect, it } from "vitest";
import { htmlToMarkdown } from "@/features/tools/calendar/server/calendarEvent";

describe("htmlToMarkdown", () => {
  it("converts Google's description HTML", () => {
    expect(htmlToMarkdown('Agenda<br><b>Bring</b> <a href="https://a.example">notes</a> &amp; laptops')).toBe(
      "Agenda  \n**Bring** [notes](https://a.example) & laptops",
    );
  });
});
