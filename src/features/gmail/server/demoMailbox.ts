import { gmailThreadUrl, type MailDetail, type MailSummary } from "@/features/gmail/model/Gmail";
import type { Mailbox } from "@/features/gmail/server/GmailService";
import { GmailError } from "@/features/gmail/server/GmailError";

const EMAIL = "me@example.com";
const HOUR = 3_600_000;

type DemoMail = Omit<MailSummary, "at" | "threadId"> & { hoursAgo: number; text: string };

const MAIL: Array<DemoMail> = [
  {
    id: "demo-mail-1",
    from: "Choi Minji",
    fromEmail: "choi@example.com",
    subject: "Firmware release notes — please review by Friday (demo)",
    snippet: "Hi, I put the draft release notes in the shared folder. Could you check the sensor calibration section?",
    unread: true,
    important: true,
    hoursAgo: 1,
    text: "Hi,\n\nI put the draft release notes in the shared folder. Could you check the sensor calibration section before Friday?\n\nThanks,\nMinji",
  },
  {
    id: "demo-mail-2",
    from: "Google Calendar",
    fromEmail: "calendar-notification@example.com",
    subject: "Invitation: Design critique (demo)",
    snippet: "You have been invited to Design critique. Join with Google Meet.",
    unread: true,
    important: false,
    hoursAgo: 5,
    text: "You have been invited to Design critique.\n\nJoin with Google Meet: https://meet.google.com/demo-abcd-efg",
  },
  {
    id: "demo-mail-3",
    from: "Park Jisoo",
    fromEmail: "park@example.com",
    subject: "Re: Log collection pipeline",
    snippet: "Thanks for the write-up. One question about the retention policy for raw logs.",
    unread: false,
    important: true,
    hoursAgo: 26,
    text: "Thanks for the write-up. One question about the retention policy for raw logs: do we keep them 30 or 90 days?",
  },
  {
    id: "demo-mail-4",
    from: "Weekly Digest",
    fromEmail: "digest@example.com",
    subject: "Your weekly summary (demo)",
    snippet: "Here is what happened in your workspace this week.",
    unread: false,
    important: false,
    hoursAgo: 50,
    text: "Here is what happened in your workspace this week: 12 issues closed, 4 pull requests merged.",
  },
];

function summary(mail: DemoMail, now: number): MailSummary {
  const { id, from, fromEmail, subject, snippet, unread, important } = mail;
  return { id, threadId: `${id}-thread`, from, fromEmail, subject, snippet, at: now - mail.hoursAgo * HOUR, unread, important };
}

/**
 * ### demoMailbox
 *
 * Made-up mail for demo mode (`pnpm dev:demo`), signed in as `me@example.com`,
 * with times relative to now so there is always something unread.
 */
export function demoMailbox(): Mailbox {
  return {
    status: async () => ({ state: "connected", reason: undefined, clientSaved: true, projectId: undefined, account: undefined, email: EMAIL, signInError: undefined, signInsEnded: 0 }),
    list: async (filter, max) => {
      const now = Date.now();
      return { messages: MAIL.filter((m) => filter === "inbox" || m.unread).slice(0, max).map((m) => summary(m, now)), email: EMAIL };
    },
    message: async (id): Promise<MailDetail> => {
      const mail = MAIL.find((m) => m.id === id);
      if (mail === undefined) throw new GmailError("That message is gone from Gmail", 404, "not-found");
      const base = summary(mail, Date.now());
      return { ...base, to: EMAIL, cc: undefined, body: { kind: "text", text: mail.text }, attachments: [], url: gmailThreadUrl(EMAIL, base.threadId) };
    },
    unread: async () => MAIL.filter((m) => m.unread).length,
  };
}
