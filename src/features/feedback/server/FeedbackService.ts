import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Agent } from "@/features/sessions/model/Agent";
import type { DebugInfo, FeedbackInput } from "@/features/feedback/model/Feedback";
import { feedbackBrief, feedbackTitle } from "@/features/feedback/server/feedbackBrief";
import { runningCheckout } from "@/platform/checkout";
import { runGit } from "@/platform/git";
import { HttpError } from "@/platform/http/HttpError";
import { dataPath, isPackagedApp } from "@/platform/paths";
import { serverLogTail } from "@/platform/serverLog";

/**
 * ### FeedbackSession
 *
 * The session feedback asks for: a lead on mothership's own checkout, in a worktree.
 */
export type FeedbackSession = { name: string; initialMessage: string; repo: string };

/**
 * ### FeedbackDependencies
 *
 * @property developer - Your Settings → Advanced choices.
 * @property startSession - Starts a session for the feedback and returns it.
 * @property toolCalls - Calls made to each work tool in the last 10 minutes.
 */
export type FeedbackDependencies = {
  developer: () => Promise<{ enabled: boolean; sourceFolder?: string }>;
  startSession: (session: FeedbackSession) => Promise<Agent>;
  toolCalls: () => DebugInfo["toolCalls"];
};

const LOG_LINES_IN_BRIEF = 60;
const LOG_LINES_IN_DEBUG = 200;

const gitLine = (folder: string, args: Array<string>) =>
  runGit(folder, args).then(
    (out) => out.trim(),
    () => undefined,
  );

/**
 * ### FeedbackService
 *
 * Developer mode: turns feedback on mothership's screen into a session that
 * changes mothership's own code, and reports how this server runs.
 */
export class FeedbackService {
  readonly #deps: FeedbackDependencies;

  constructor(deps: FeedbackDependencies) {
    this.#deps = deps;
  }

  /**
   * ### sourceFolder
   *
   * @returns The mothership checkout feedback works on.
   * @throws {@link HttpError} 409 when developer mode is off or no checkout is known.
   */
  async sourceFolder(): Promise<string> {
    const developer = await this.#deps.developer();
    const source = developer.sourceFolder ?? runningCheckout();
    if (!developer.enabled) throw new HttpError("Developer mode is off. Turn it on in Settings → Advanced.", 409);
    if (source === undefined) throw new HttpError("Choose mothership's source folder in Settings → Advanced.", 409);
    return source;
  }

  /**
   * ### submit
   *
   * Starts a session on the source folder with the feedback, its screenshot
   * (saved under `.mothership/feedback/`), the checkout's commit, and the end
   * of the server log. You review and merge its changes as with any session.
   *
   * @throws {@link HttpError} 409 when developer mode is not set up.
   */
  async submit(input: FeedbackInput): Promise<Agent> {
    const source = await this.sourceFolder();
    const screenshotPath = input.screenshot === undefined ? undefined : await saveScreenshot(input.screenshot);
    const [logTail, commit] = await Promise.all([serverLogTail(LOG_LINES_IN_BRIEF), gitLine(source, ["log", "-1", "--format=%h %s"])]);
    return this.#deps.startSession({
      name: feedbackTitle(input.text),
      initialMessage: feedbackBrief(input, { screenshotPath, commit, logTail }),
      repo: source,
    });
  }

  /**
   * ### debugInfo
   *
   * @returns How this server runs, the source checkout's state, recent work-tool calls, and the end of the server log.
   */
  async debugInfo(): Promise<DebugInfo> {
    const developer = await this.#deps.developer();
    const source = developer.sourceFolder ?? runningCheckout();
    const git = (args: Array<string>) => (source === undefined ? Promise.resolve(undefined) : gitLine(source, args));
    const [branch, commit, status, log] = await Promise.all([
      git(["rev-parse", "--abbrev-ref", "HEAD"]),
      git(["log", "-1", "--format=%h %s"]),
      git(["status", "--porcelain"]),
      serverLogTail(LOG_LINES_IN_DEBUG),
    ]);
    return {
      packaged: isPackagedApp(),
      dataDir: dataPath(),
      node: process.version,
      developer: {
        enabled: developer.enabled,
        source,
        branch,
        commit,
        changedFiles: status === undefined ? undefined : status.split("\n").filter((line) => line !== "").length,
      },
      log,
      toolCalls: this.#deps.toolCalls(),
    };
  }
}

/** Saves a `data:image/png;base64,…` URL and returns the file's path. */
async function saveScreenshot(dataUrl: string): Promise<string> {
  const folder = dataPath(".mothership", "feedback");
  await mkdir(folder, { recursive: true });
  const file = path.join(folder, `${new Date().toISOString().replace(/[:.]/g, "-")}.png`);
  await writeFile(file, Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64"));
  return file;
}
