import { claudeCommand, codexCommand } from "@/platform/agentBinaries";
import { openInTerminal, startDockerDesktop } from "@/platform/desktop/desktop";
import type { SetupAction } from "@/features/settings/model/Settings";

/**
 * ### SETUP_COMMANDS
 *
 * The command each setup step runs. Logins open in a terminal window
 * because they ask you to sign in in a browser.
 */
export const SETUP_COMMANDS: Record<SetupAction, () => Promise<void>> = {
  "claude-login": () => openInTerminal([claudeCommand(), "auth", "login"]),
  "codex-login": () => openInTerminal([codexCommand(), "login"]),
  "gh-login": () => openInTerminal(["gh", "auth", "login"]),
  "docker-start": () => startDockerDesktop(),
};
