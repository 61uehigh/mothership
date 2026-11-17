import type { GmailErrorCode } from "@/lib/apiErrorCodes";
import type { GmailStatus, GmailTest, MailDetail, MailFilter, MailList } from "@/features/gmail/model/Gmail";
import type { GmailAuth } from "@/features/gmail/server/GmailAuth";
import { GmailError } from "@/features/gmail/server/GmailError";
import { gmailAddress, listInbox, readMessage, unreadCount } from "@/features/gmail/server/gmailApi";
import { errorMessage, toError } from "@/lib/errors";

/** The section's and the Inbox's lists stay this long before Gmail is asked again. */
const LIST_TTL_MS = 60_000;
/** Messages a list holds. */
const LIST_SIZE = 25;

/**
 * ### Mailbox
 *
 * Where the mail comes from: your Gmail through its API, or made-up mail in demo mode.
 */
export type Mailbox = {
  status: () => Promise<GmailStatus>;
  list: (filter: MailFilter, max: number) => Promise<MailList>;
  message: (id: string) => Promise<MailDetail>;
  unread: () => Promise<number>;
  /** A name for the account, kept as who is signed in after a test. */
  remember?: (account: string) => Promise<void>;
};

/**
 * ### gmailMailbox
 *
 * Your Gmail, read with the sign-in in `auth`.
 */
export function gmailMailbox(auth: GmailAuth): Mailbox {
  const email = async (token: string) => (await auth.status()).email ?? (await gmailAddress(token));
  return {
    status: () => auth.status(),
    list: async (filter, max) => {
      const token = await auth.accessToken();
      const [messages, address] = await Promise.all([listInbox(token, filter, max), email(token)]);
      return { messages, email: address };
    },
    message: async (id) => {
      const token = await auth.accessToken();
      return readMessage(token, id, await email(token));
    },
    unread: async () => unreadCount(await auth.accessToken()),
    remember: (account) => auth.rememberAccount(account),
  };
}

type Cached = { at: number; value: Promise<MailList> };

/**
 * ### GmailService
 *
 * The Gmail section's and the Inbox's reads, with the inbox list cached for
 * a minute so the two (and the sidebar's refreshes) share one set of calls.
 * Holds the cache, so it lives on the shared server state.
 */
export class GmailService {
  readonly #mailbox: Mailbox;
  readonly #lists = new Map<MailFilter, Cached>();

  constructor(mailbox: Mailbox) {
    this.#mailbox = mailbox;
  }

  /**
   * ### status
   *
   * @returns Where the sign-in stands; never calls Gmail.
   */
  status(): Promise<GmailStatus> {
    return this.#mailbox.status();
  }

  /**
   * ### list
   *
   * @param refresh - Ask Gmail again instead of using a list from the last minute.
   * @throws GmailError When Gmail cannot be read (see its `code`).
   */
  list(filter: MailFilter, refresh: boolean): Promise<MailList> {
    const cached = this.#lists.get(filter);
    if (!refresh && cached !== undefined && Date.now() - cached.at < LIST_TTL_MS) return cached.value;
    const value = this.#mailbox.list(filter, LIST_SIZE);
    const entry = { at: Date.now(), value };
    this.#lists.set(filter, entry);
    // A failure is not kept: the next look asks again.
    value.catch(() => {
      if (this.#lists.get(filter) === entry) this.#lists.delete(filter);
    });
    return value;
  }

  /**
   * ### message
   *
   * @throws GmailError With code `not-found` when there is no such message.
   */
  message(id: string): Promise<MailDetail> {
    return this.#mailbox.message(id);
  }

  /**
   * ### inboxMail
   *
   * The unread inbox for the Inbox: `undefined` when Gmail is not set up or
   * signed in (it is then not in use), the failure when it cannot be read.
   */
  async inboxMail(refresh: boolean): Promise<MailList | Error | undefined> {
    const { state } = await this.#mailbox.status();
    if (state === "unconfigured" || state === "disconnected") return undefined;
    try {
      return await this.list("unread", refresh);
    } catch (error) {
      if (error instanceof GmailError && (error.code === "unconfigured" || error.code === "disconnected")) return undefined;
      return toError(error);
    }
  }

  /**
   * ### test
   *
   * Settings' "Test connection": reads the account and the inbox's unread count.
   *
   * @returns A result to show, never a rejection.
   */
  async test(): Promise<GmailTest> {
    try {
      const [unread, list] = await Promise.all([this.#mailbox.unread(), this.list("unread", true)]);
      if (list.email !== undefined) await this.#mailbox.remember?.(list.email);
      return { ok: true, who: list.email, unread };
    } catch (error) {
      return { ok: false, message: errorMessage(error), code: error instanceof GmailError ? (error.code as GmailErrorCode | undefined) : undefined };
    }
  }

  /**
   * ### forget
   *
   * Drops the cached lists, after a sign-in or sign-out.
   */
  forget(): void {
    this.#lists.clear();
  }
}
