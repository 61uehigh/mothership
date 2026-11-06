import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_INBOX_RULES } from "@/features/inbox/model/Inbox";
import type { InboxInputs } from "@/features/inbox/server/buildInbox";
import { InboxReadStore } from "@/features/inbox/server/InboxReadStore";
import { InboxService } from "@/features/inbox/server/InboxService";

const review = vi.hoisted(() => ({ run: async () => ({ day: "", at: 0, moves: {} }) }));
vi.mock("@/features/inbox/server/inboxReview", () => ({ readInboxReview: async () => undefined, reviewInbox: () => review.run() }));

const NO_INPUTS: InboxInputs = {
  questions: [],
  agentNames: new Map(),
  slack: undefined,
  calendar: undefined,
  linear: undefined,
  linearNotifications: undefined,
  github: { overview: { repo: "o/r", reviewRequests: [], myPullRequests: [], assignedIssues: [], runs: [], fetchedAt: 0 }, statuses: new Map() },
  gmail: undefined,
};

describe("InboxService.mark", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "inbox-service-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  function service(markLinear: (ids: Array<string>, read: boolean) => Promise<void>) {
    return new InboxService({
      rules: async () => ({ ...DEFAULT_INBOX_RULES, claudeReview: false }),
      inputs: async () => NO_INPUTS,
      timeZone: async () => "UTC",
      reads: new InboxReadStore(path.join(dir, "inbox-read.json")),
      markLinear,
    });
  }

  it("marks the notifications in Linear the same way as the item, only when given", async () => {
    const markLinear = vi.fn(async () => undefined);
    const inbox = service(markLinear);
    await inbox.mark(["linear:DEV-1@1"], true);
    expect(markLinear).not.toHaveBeenCalled();
    await inbox.mark(["linear:DEV-1@1"], true, ["n1", "n2"]);
    expect(markLinear).toHaveBeenLastCalledWith(["n1", "n2"], true);
    await inbox.mark(["linear:DEV-1@1"], false, ["n1"]);
    expect(markLinear).toHaveBeenLastCalledWith(["n1"], false);
  });

  it("still reads the item here when Linear cannot be reached", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const inbox = service(async () => {
      throw new Error("Linear refused LINEAR_API_KEY");
    });
    await expect(inbox.mark(["linear:DEV-1@1"], true, ["n1"])).resolves.toMatchObject({ items: [] });
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe("InboxService.reviewNow", () => {
  it("never runs two reviews at once, so a later one cannot be overwritten", async () => {
    let running = 0;
    let most = 0;
    // The first review holds until the test has seen it running; a fixed delay raced the load under a busy test run.
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    review.run = async () => {
      running++;
      most = Math.max(most, running);
      await held;
      running--;
      return { day: "2026-11-23", at: 1, moves: {} };
    };
    const dir = await mkdtemp(path.join(tmpdir(), "inbox-review-"));
    const inbox = new InboxService({
      rules: async () => DEFAULT_INBOX_RULES,
      inputs: async () => NO_INPUTS,
      timeZone: async () => "UTC",
      reads: new InboxReadStore(path.join(dir, "inbox-read.json")),
      markLinear: async () => undefined,
    });
    const first = inbox.reviewNow();
    await new Promise((resolve) => setTimeout(resolve, 1));
    expect((await inbox.load(false)).reviewing).toBe(true);
    const second = inbox.reviewNow();
    release();
    await Promise.all([first, second]);
    expect(most).toBe(1);
    expect((await inbox.load(false)).reviewing).toBe(false);
    await rm(dir, { recursive: true, force: true });
  });
});
