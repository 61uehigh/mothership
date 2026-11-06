import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { claudeCommand, codexCommand } from "@/platform/agentBinaries";
import { HttpError } from "@/platform/http/HttpError";
import { openInTerminal, shellQuote } from "@/platform/terminal";

const run = promisify(execFile);

/**
 * ### SETUP_ACTIONS
 *
 * Setup steps the Settings screen can start, each with a fixed command.
 * Logins open in Terminal because they ask you to sign in in a browser.
 */
export const SETUP_ACTIONS = {
  "claude-login": () => openInTerminal(`${shellQuote(claudeCommand())} auth login`),
  "codex-login": () => openInTerminal(`${shellQuote(codexCommand())} login`),
  "gh-login": () => openInTerminal("gh auth login"),
  "docker-start": async () => {
    if (process.platform !== "darwin") throw new HttpError("Starting Docker Desktop from here is only supported on macOS", 501);
    await run("open", ["-a", "Docker"]);
  },
} as const;

/**
 * ### SetupAction
 *
 * One of {@link SETUP_ACTIONS}.
 */
export type SetupAction = keyof typeof SETUP_ACTIONS;
