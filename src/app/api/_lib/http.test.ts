import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseBody } from "@/app/api/_lib/http";

const post = (body: unknown) => new Request("http://127.0.0.1/api/x", { method: "POST", body: JSON.stringify(body) });

describe("parseBody", () => {
  const schema = z.object({
    folder: z.string().superRefine((dir, context) => {
      if (!dir.startsWith("/")) context.addIssue({ code: "custom", message: "Use a full path", params: { code: "folder-not-absolute" } });
    }),
    count: z.number(),
  });

  it("sends the code of a custom check next to every problem's text", async () => {
    const response = await parseBody(post({ folder: "rel", count: "x" }), schema);
    if (!(response instanceof Response)) throw new Error("expected a 400");
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string; code?: string };
    expect(body.code).toBe("folder-not-absolute");
    expect(body.error).toContain("Use a full path");
    expect(body.error).toContain("count");
  });

  it("sends no code when no custom check failed", async () => {
    const response = await parseBody(post({ folder: "/a", count: "x" }), schema);
    if (!(response instanceof Response)) throw new Error("expected a 400");
    expect(await response.json()).not.toHaveProperty("code");
  });
});
