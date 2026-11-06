import type { InboxItem, InboxReason, LinearNotificationWhat } from "@/features/inbox/model/Inbox";
import type { Translate } from "@/ui/i18n/translate";

function notificationText(t: Translate, what: LinearNotificationWhat): string {
  switch (what.kind) {
    case "mentioned":
      return t("inbox.reason.notification.mentioned", { issue: what.issue });
    case "assigned":
      return t("inbox.reason.notification.assigned", { issue: what.issue });
    case "commented":
      return t("inbox.reason.notification.commented", { issue: what.issue });
    case "reacted":
      return t("inbox.reason.notification.reacted", { issue: what.issue });
    case "updated":
      return t("inbox.reason.notification.updated", { issue: what.issue });
    case "changed":
      return t("inbox.reason.notification.changed", { change: what.change, issue: what.issue });
  }
}

function eventWhen(t: Translate, days: number, time: string): string {
  if (days === 0) return t("inbox.reason.event.today", { time });
  if (days === 1) return t("inbox.reason.event.tomorrow", { time });
  return t("inbox.reason.event.inDays", { days, time });
}

/**
 * ### inboxReasonPhrase
 *
 * One rule's reason in the chosen language, e.g. "Due in 3 days" or "3일 후 마감".
 */
export function inboxReasonPhrase(t: Translate, reason: InboxReason): string {
  switch (reason.code) {
    case "agent-question":
      return t("inbox.reason.agentQuestion");
    case "review-request":
      return t("inbox.reason.reviewRequest");
    case "my-pr-failing":
      return t("inbox.reason.myPrFailing");
    case "my-pr-changes":
      return t("inbox.reason.myPrChanges");
    case "my-draft-pr":
      return t("inbox.reason.myDraftPr");
    case "my-pr":
      return t("inbox.reason.myPr");
    case "github-issue":
      return t("inbox.reason.githubIssue");
    case "slack-dm":
      return reason.recent ? t("inbox.reason.slackDmRecent", { hours: reason.hours }) : t("inbox.reason.slackDmOlder", { hours: reason.hours });
    case "slack-mention":
      return reason.recent
        ? t("inbox.reason.slackMentionRecent", { channel: reason.channel, hours: reason.hours })
        : t("inbox.reason.slackMentionOlder", { channel: reason.channel, hours: reason.hours });
    case "slack-group":
      return t("inbox.reason.slackGroup", { channel: reason.channel });
    case "event": {
      const when = eventWhen(t, reason.days, reason.time);
      if (reason.rsvp === undefined) return when;
      return reason.rsvp === "tentative" ? t("inbox.reason.rsvpMaybe", { when }) : t("inbox.reason.rsvp", { when });
    }
    case "linear-notification": {
      const what = notificationText(t, reason.what);
      return reason.olderThanHours === undefined ? what : t("inbox.reason.olderThan", { what, hours: reason.olderThanHours });
    }
    case "mail-important":
      return t("inbox.reason.mailImportant");
    case "mail-unread":
      return t("inbox.reason.mailUnread");
    case "linear-overdue":
      return reason.days === 1 ? t("inbox.reason.overdueOneDay") : t("inbox.reason.overdueDays", { days: reason.days });
    case "linear-due-today":
      return t("inbox.reason.dueToday");
    case "linear-urgent":
      return t("inbox.reason.urgent");
    case "linear-due-in":
      return reason.days === 1 ? t("inbox.reason.dueInOneDay") : t("inbox.reason.dueInDays", { days: reason.days });
    case "linear-high":
      return t("inbox.reason.high");
    case "linear-subscribed":
      return t("inbox.reason.subscribed");
  }
}

/**
 * ### inboxReasonText
 *
 * Why an Inbox item is where it is, in the chosen language: the rules'
 * reasons joined with " · ", or Claude's words with the rules' reasons
 * after them when Claude's review moved it. Lives in the shell because both
 * the Inbox and the Daily tab show it.
 */
export function inboxReasonText(t: Translate, item: Pick<InboxItem, "reason" | "movedBy" | "why">): string {
  const rules = item.reason.map((reason) => inboxReasonPhrase(t, reason)).join(" · ");
  return item.movedBy === "claude" && item.why !== undefined ? t("inbox.reason.moved", { why: item.why, rules }) : rules;
}
