import { describe, expect, it, vi } from "vitest";
import type { GmailStatus } from "@/features/gmail/model/Gmail";
import { GmailError } from "@/features/gmail/server/GmailError";
import { GmailService, type Mailbox } from "@/features/gmail/server/GmailService";

const status = (state: GmailStatus["state"]): GmailStatus => ({ state, reason: undefined, clientSaved: true, projectId: undefined, account: undefined, email: undefined, signInError: undefined, signInsEnded: 0 });

function mailbox(state: GmailStatus["state"], list: Mailbox["list"]): Mailbox {
  return { status: async () => status(state), list, message: async () => Promise.reject(new Error("unused")), unread: async () => 0 };
}

describe("GmailService", () => {
  it("shares one list for a minute, asks again on refresh, and does not keep a failure", async () => {
    let calls = 0;
    const list = vi.fn(async () => {
      calls++;
      if (calls === 2) throw new GmailError("Could not reach Gmail", 502, "failed");
      return { messages: [], email: `call ${calls}` };
    });
    const service = new GmailService(mailbox("connected", list));
    expect((await service.list("unread", false)).email).toBe("call 1");
    expect((await service.list("unread", false)).email).toBe("call 1");
    await expect(service.list("unread", true)).rejects.toThrow("Could not reach Gmail");
    expect((await service.list("unread", false)).email).toBe("call 3");
    expect(list).toHaveBeenCalledTimes(3);
  });

  it("leaves Gmail out of the Inbox until it is signed in, and passes on failures once it is", async () => {
    const never = vi.fn(async () => ({ messages: [], email: undefined }));
    expect(await new GmailService(mailbox("unconfigured", never)).inboxMail(false)).toBeUndefined();
    expect(await new GmailService(mailbox("disconnected", never)).inboxMail(false)).toBeUndefined();
    expect(never).not.toHaveBeenCalled();
    const expired = new GmailService(mailbox("expired", async () => Promise.reject(new GmailError("Google no longer accepts the Gmail sign-in", 401, "expired"))));
    expect(await expired.inboxMail(false)).toMatchObject({ message: "Google no longer accepts the Gmail sign-in" });
  });
});
