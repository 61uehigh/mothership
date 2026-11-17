import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeEncodedWords, gmailFailure, listInbox, mailBody, parseAddress, parseDetail, parseSummary } from "@/features/gmail/server/gmailApi";

const b64 = (text: string) => Buffer.from(text, "utf8").toString("base64url");

const message = (fields: Record<string, unknown> = {}) => ({
  id: "m1",
  threadId: "t1",
  labelIds: ["INBOX", "UNREAD", "IMPORTANT"],
  snippet: "Hi &amp; welcome",
  internalDate: "1700000000000",
  payload: {
    mimeType: "multipart/mixed",
    headers: [
      { name: "From", value: '"Kim, Ada" <ada@example.com>' },
      { name: "Subject", value: "=?UTF-8?B?7ZqM7J2YIOyekOujjA==?=" },
      { name: "To", value: "me@example.com" },
    ],
    parts: [
      { mimeType: "multipart/alternative", parts: [
        { mimeType: "text/plain", headers: [{ name: "Content-Type", value: "text/plain; charset=UTF-8" }], body: { data: b64("plain body") } },
        { mimeType: "text/html", headers: [{ name: "Content-Type", value: 'text/html; charset="utf-8"' }], body: { data: b64("<p>html body</p>") } },
      ] },
      { mimeType: "application/pdf", filename: "spec.pdf", body: { attachmentId: "x", size: 10 } },
    ],
  },
  ...fields,
});

afterEach(() => vi.unstubAllGlobals());

describe("parseAddress", () => {
  it("splits quoted names, bare addresses, and names without an address", () => {
    expect(parseAddress('"Kim, Ada" <ada@example.com>')).toEqual({ name: "Kim, Ada", email: "ada@example.com" });
    expect(parseAddress("<noreply@example.com>")).toEqual({ name: "noreply@example.com", email: "noreply@example.com" });
    expect(parseAddress("ada@example.com")).toEqual({ name: "ada@example.com", email: "ada@example.com" });
    expect(parseAddress("Mailer Daemon")).toEqual({ name: "Mailer Daemon", email: undefined });
  });
});

describe("decodeEncodedWords", () => {
  it("decodes base64 and quoted-printable words, joined across whitespace", () => {
    expect(decodeEncodedWords("=?UTF-8?B?7ZqM7J2YIOyekOujjA==?=")).toBe("회의 자료");
    expect(decodeEncodedWords("=?utf-8?Q?caf=C3=A9_menu?= =?utf-8?Q?_today?=")).toBe("café menu today");
    expect(decodeEncodedWords("plain")).toBe("plain");
    expect(decodeEncodedWords("=?x-unknown?B?YQ==?=")).toBe("=?x-unknown?B?YQ==?=");
  });
});

describe("parseSummary and parseDetail", () => {
  it("reads the headers, labels, and time", () => {
    expect(parseSummary(message())).toEqual({
      id: "m1",
      threadId: "t1",
      from: "Kim, Ada",
      fromEmail: "ada@example.com",
      subject: "회의 자료",
      snippet: "Hi & welcome",
      at: 1_700_000_000_000,
      unread: true,
      important: true,
    });
    expect(parseSummary(message({ labelIds: ["INBOX"], payload: { headers: [] } }))).toMatchObject({ from: "", subject: "", unread: false, important: false });
  });

  it("prefers the HTML part, names attachments, and links the thread in the signed-in account", () => {
    const detail = parseDetail(message(), "me@example.com");
    expect(detail.body).toEqual({ kind: "html", html: "<p>html body</p>" });
    expect(detail.attachments).toEqual(["spec.pdf"]);
    expect(detail.to).toBe("me@example.com");
    expect(detail.url).toBe("https://mail.google.com/mail/u/me%40example.com/#all/t1");
  });

  it("falls back to plain text in the part's own charset, then to the snippet", () => {
    const eucKr = Buffer.from([0xc7, 0xd1, 0xb1, 0xdb]).toString("base64url");
    expect(mailBody({ mimeType: "text/plain", headers: [{ name: "Content-Type", value: "text/plain; charset=euc-kr" }], body: { data: eucKr } }, "").body).toEqual({ kind: "text", text: "한글" });
    expect(mailBody(undefined, "only &lt;snippet&gt;").body).toEqual({ kind: "text", text: "only <snippet>" });
  });
});

describe("gmailFailure", () => {
  const body = (message: string, reason: string, status?: string) => ({ error: { code: 403, message, status, errors: [{ reason }] } });

  it("tells a disabled API, a missing scope, an expired sign-in, and rate limits apart", () => {
    expect(gmailFailure(403, body("Gmail API has not been used in project 123 before or it is disabled.", "accessNotConfigured", "PERMISSION_DENIED")).code).toBe("api-disabled");
    expect(gmailFailure(403, body("Request had insufficient authentication scopes.", "insufficientPermissions", "PERMISSION_DENIED")).code).toBe("scope");
    expect(gmailFailure(401, body("Invalid Credentials", "authError")).code).toBe("expired");
    expect(gmailFailure(429, body("Too many requests", "rateLimitExceeded")).code).toBe("quota");
    expect(gmailFailure(404, undefined).code).toBe("not-found");
    expect(gmailFailure(500, "not json")).toMatchObject({ code: "failed", message: "Gmail: status 500" });
  });
});

describe("listInbox", () => {
  it("asks for unread inbox mail, reads each message's headers, skips one deleted meanwhile, and sorts newest first", async () => {
    const urls: Array<string> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(url);
        if (url.includes("/messages?")) return Response.json({ messages: [{ id: "old", threadId: "t" }, { id: "gone", threadId: "t" }, { id: "new", threadId: "t" }] });
        if (url.includes("/messages/gone")) return Response.json({ error: { code: 404, message: "Not Found" } }, { status: 404 });
        const id = url.includes("/messages/old") ? "old" : "new";
        return Response.json(message({ id, internalDate: id === "old" ? "1000" : "2000" }));
      }),
    );
    const list = await listInbox("token", "unread", 3);
    expect(list.map((m) => m.id)).toEqual(["new", "old"]);
    const first = new URL(urls[0] ?? "");
    expect(first.searchParams.get("labelIds")).toBe("INBOX");
    expect(first.searchParams.get("q")).toBe("is:unread");
    expect(first.searchParams.get("maxResults")).toBe("3");
    expect(new URL(urls[1] ?? "").searchParams.getAll("metadataHeaders")).toEqual(["From", "Subject", "Date"]);
  });
});
