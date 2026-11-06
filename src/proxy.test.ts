import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "@/proxy";

function request(method: string, headers: Record<string, string>, path = "/api/tools/slack/send"): NextRequest {
  return new NextRequest(`http://127.0.0.1:3000${path}`, { method, headers: { host: "127.0.0.1:3000", ...headers } });
}

describe("proxy", () => {
  it("lets the app's own pages change things", () => {
    expect(proxy(request("POST", { origin: "http://127.0.0.1:3000", "sec-fetch-site": "same-origin" })).status).toBe(200);
  });

  it("blocks writes from other sites", () => {
    expect(proxy(request("POST", { origin: "https://evil.example", "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect(proxy(request("POST", { origin: "https://evil.example" })).status).toBe(403);
  });

  it("blocks other sites from reading API data, but not pages", () => {
    expect(proxy(request("GET", { "sec-fetch-site": "cross-site" }, "/api/search?q=x")).status).toBe(403);
    expect(proxy(request("GET", { "sec-fetch-site": "same-origin" }, "/api/search?q=x")).status).toBe(200);
    expect(proxy(request("GET", { "sec-fetch-site": "none" }, "/")).status).toBe(200);
    expect(proxy(request("GET", { "sec-fetch-site": "cross-site" }, "/")).status).toBe(200);
  });

  it("blocks DNS rebinding by host", () => {
    expect(proxy(request("GET", { host: "evil.example:3000" }, "/api/agents")).status).toBe(403);
  });

  it("lets local scripts and agents' control calls through", () => {
    expect(proxy(request("POST", {})).status).toBe(200);
    expect(proxy(request("POST", { "sec-fetch-site": "cross-site" }, "/api/control")).status).toBe(200);
  });
});
