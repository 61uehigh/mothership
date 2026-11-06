import { describe, expect, it } from "vitest";
import type { InboxReason } from "@/features/inbox/model/Inbox";
import { inboxReasonPhrase, inboxReasonText } from "@/shell/inboxReasonText";
import { translator } from "@/ui/i18n/translate";

const en = translator("en");

describe("inboxReasonPhrase", () => {
  it("names the day of an event, then whether it waits for your answer", () => {
    expect(inboxReasonPhrase(en, { code: "event", days: 0, time: "10:00–10:15", rsvp: undefined })).toBe("Today 10:00–10:15");
    expect(inboxReasonPhrase(en, { code: "event", days: 1, time: "10:00–10:15", rsvp: undefined })).toBe("Tomorrow 10:00–10:15");
    expect(inboxReasonPhrase(en, { code: "event", days: 3, time: "10:00–10:15", rsvp: "needsAction" })).toBe("Needs your RSVP, In 3 days, 10:00–10:15");
    expect(inboxReasonPhrase(en, { code: "event", days: 0, time: "10:00–10:15", rsvp: "tentative" })).toBe("Needs your RSVP (you said Maybe), Today 10:00–10:15");
  });

  it("uses the singular for one day overdue or due", () => {
    const phrase = (reason: InboxReason) => inboxReasonPhrase(en, reason);
    expect([phrase({ code: "linear-overdue", days: 1 }), phrase({ code: "linear-overdue", days: 2 })]).toEqual(["Overdue by 1 day", "Overdue by 2 days"]);
    expect([phrase({ code: "linear-due-in", days: 1 }), phrase({ code: "linear-due-in", days: 3 })]).toEqual(["Due in 1 day", "Due in 3 days"]);
  });

  it("says how old a Slack message or Linear notification is from the rule's hours", () => {
    expect(inboxReasonPhrase(en, { code: "slack-mention", channel: "#dev", hours: 24, recent: false })).toBe("Mentioned you in #dev, older than 24h");
    expect(inboxReasonPhrase(en, { code: "linear-notification", what: { kind: "assigned", issue: "DEV-1" }, olderThanHours: 24 })).toBe("Assigned to you: DEV-1, older than 24h");
  });
});

describe("inboxReasonText", () => {
  it("joins the rules' reasons", () => {
    const reason: Array<InboxReason> = [
      { code: "linear-notification", what: { kind: "mentioned", issue: "DEV-1" }, olderThanHours: undefined },
      { code: "linear-due-in", days: 27 },
    ];
    expect(inboxReasonText(en, { reason, movedBy: undefined, why: undefined })).toBe("Mentioned you on DEV-1 · Due in 27 days");
  });

  it("puts Claude's words first when its review moved the item", () => {
    expect(inboxReasonText(en, { reason: [{ code: "github-issue" }], movedBy: "claude", why: "Blocks a release" })).toBe("Blocks a release (Claude; rules: Assigned to you)");
  });
});
