import { describe, expect, it } from "vitest";
import { meetingActivity, prActivity, sessionActivity } from "@/features/todos/server/activitySources";

const day = { from: 1_000, to: 2_000 };
const session = { id: "s1", name: "Fix login", parentId: undefined, workingDirectory: "/Users/me/work/app", createdAt: 500, lastActivityAt: 1_500 };

describe("sessionActivity", () => {
  it("dates a session by when you last worked in it on that day", () => {
    expect(sessionActivity([session], day)).toEqual([{ id: "session:s1", kind: "session", title: "Fix login", detail: "app", at: 1_500, url: undefined, agentId: "s1" }]);
  });

  it("falls back to when it was made when you last worked in it on another day", () => {
    expect(sessionActivity([{ ...session, createdAt: 1_200, lastActivityAt: 5_000 }], day)[0]?.at).toBe(1_200);
  });

  it("leaves out sub-agents", () => {
    expect(sessionActivity([{ ...session, parentId: "lead" }], day)).toEqual([]);
  });

  it("names a Windows working folder by its last part", () => {
    expect(sessionActivity([{ ...session, workingDirectory: "C:\\Users\\me\\work\\app" }], day)[0]?.detail).toBe("app");
  });
});

describe("meetingActivity", () => {
  const event = { id: "e1", title: "Standup", location: "Room 1", start: 1_100, end: 1_400, url: "https://calendar/e1", allDay: false, myResponse: "accepted" };

  it("keeps timed meetings you did not decline", () => {
    expect(meetingActivity([event])).toEqual([
      { id: "meeting:e1", kind: "meeting", title: "Standup", detail: "Room 1", at: 1_100, end: 1_400, url: "https://calendar/e1", eventId: "e1" },
    ]);
  });

  it("leaves out all-day events, events without a start, and declined ones", () => {
    expect(meetingActivity([{ ...event, allDay: true }, { ...event, start: undefined }, { ...event, myResponse: "declined" }])).toEqual([]);
  });
});

describe("prActivity", () => {
  it("details a pull request by its repository's name without the owner", () => {
    expect(prActivity({ what: "merged", repo: "acme/api", number: 12, title: "Add search", url: "u", at: 1 })).toMatchObject({ id: "pr-merged:acme/api#12", kind: "pr-merged", detail: "api#12" });
  });
});
