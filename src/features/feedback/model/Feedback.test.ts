import { describe, expect, it } from "vitest";
import { feedbackInput, feedbackSchema, PAGE_ERROR_MAX, TARGET_LABEL_MAX, type FeedbackDraft } from "@/features/feedback/model/Feedback";

const TIME = "10:42:07 PM";
const time = () => TIME;

function draft(overrides: Partial<FeedbackDraft> = {}): FeedbackDraft {
  return {
    text: "Make this bigger",
    screen: "tab:pr",
    target: undefined,
    screenshot: undefined,
    pageErrors: [],
    viewport: { width: 1280, height: 800, theme: "light" },
    ...overrides,
  };
}

describe("feedbackInput", () => {
  it("always passes the route's schema, however long the page's errors, label, path, and text are", () => {
    const input = feedbackInput(
      draft({
        text: "x".repeat(10_000),
        screen: "s".repeat(500),
        target: { area: "a".repeat(500), path: "p".repeat(5000), text: "t".repeat(5000), label: "l".repeat(5000) },
        screenshot: `data:image/png;base64,${"A".repeat(9_000_000)}`,
        pageErrors: Array.from({ length: 30 }, (_, n) => ({ at: n, message: "e".repeat(PAGE_ERROR_MAX) })),
      }),
      time,
    );
    expect(feedbackSchema.safeParse(input).success).toBe(true);
  });

  it("keeps the time in front of an error and cuts the error, not the time", () => {
    const [error] = feedbackInput(draft({ pageErrors: [{ at: 0, message: "e".repeat(PAGE_ERROR_MAX) }] }), time).pageErrors;
    expect(error).toHaveLength(PAGE_ERROR_MAX);
    expect(error?.startsWith(`${TIME} e`)).toBe(true);
  });

  it("keeps the newest errors when there are too many", () => {
    const errors = Array.from({ length: 25 }, (_, n) => ({ at: n, message: `error ${n}` }));
    const sent = feedbackInput(draft({ pageErrors: errors }), time).pageErrors;
    expect(sent).toHaveLength(20);
    expect(sent.at(-1)).toBe(`${TIME} error 24`);
  });

  it("cuts a long label, such as a long to-do's title, to the label limit", () => {
    const input = feedbackInput(draft({ target: { area: "todos", path: "li", text: "", label: "l".repeat(500) } }), time);
    expect(input.target?.label).toHaveLength(TARGET_LABEL_MAX);
  });

  it("leaves out a screenshot too large to send, rather than the whole feedback", () => {
    const input = feedbackInput(draft({ screenshot: `data:image/png;base64,${"A".repeat(9_000_000)}` }), time);
    expect(input.screenshot).toBeUndefined();
  });

  it("leaves short parts as they are", () => {
    const target = { area: "sidebar:slack", path: "aside > button", text: "Send", label: "Send message" };
    const input = feedbackInput(draft({ target, pageErrors: [{ at: 0, message: "boom" }] }), time);
    expect(input.target).toEqual(target);
    expect(input.pageErrors).toEqual([`${TIME} boom`]);
  });
});
