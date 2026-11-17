import { describe, expect, it } from "vitest";
import { localeFromAcceptLanguage, oauthCallback, type GoogleSignInFlow } from "@/app/_lib/oauthPages";
import type { GoogleOAuthSignInFailure } from "@/lib/apiErrorCodes";

describe("localeFromAcceptLanguage", () => {
  it("follows the browser's first choice, with or without a region", () => {
    expect(localeFromAcceptLanguage("ko-KR,ko;q=0.9,en-US;q=0.8")).toBe("ko");
    expect(localeFromAcceptLanguage("en-GB,ko;q=0.5")).toBe("en");
  });

  it("ranks by q-value, not by order", () => {
    expect(localeFromAcceptLanguage("en;q=0.3, ko;q=0.8")).toBe("ko");
  });

  it("skips languages the UI is not written in and ones refused with q=0", () => {
    expect(localeFromAcceptLanguage("ja,ko;q=0.7,en;q=0.5")).toBe("ko");
    expect(localeFromAcceptLanguage("ko;q=0,en;q=0.1")).toBe("en");
  });

  it("falls back to English without a usable header", () => {
    expect(localeFromAcceptLanguage(null)).toBe("en");
    expect(localeFromAcceptLanguage("*")).toBe("en");
    expect(localeFromAcceptLanguage("fr-FR")).toBe("en");
  });
});

describe("oauthCallback", () => {
  const flow = (overrides: Partial<GoogleSignInFlow> = {}): GoogleSignInFlow => ({
    startSignIn: async () => "",
    finishSignIn: async () => undefined,
    failSignIn: () => {},
    ...overrides,
  });
  const request = (query: string, language = "ko-KR") => new Request(`http://127.0.0.1/gmail/callback?${query}`, { headers: { "accept-language": language } });

  it("keeps the sign-in, runs afterSuccess, and says so in the browser's language", async () => {
    let after = 0;
    const response = await oauthCallback({ service: "Gmail", auth: () => flow(), afterSuccess: () => after++ })(request("state=s&code=c"));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Gmail에 연결되었습니다");
    expect(after).toBe(1);
  });

  it("records Google's refusal and escapes its words into the page", async () => {
    const failures: Array<GoogleOAuthSignInFailure> = [];
    const auth = () => flow({ failSignIn: (_state, error) => failures.push(error) });
    const response = await oauthCallback({ service: "Gmail", auth })(request("state=s&error=access_denied&error_description=%3Cb%3E", "en"));
    expect(response.status).toBe(400);
    expect(failures).toEqual([{ code: "denied", detail: "access_denied: <b>" }]);
    const html = await response.text();
    expect(html).toContain("Gmail was not connected");
    expect(html).not.toContain("<b>");
  });
});
