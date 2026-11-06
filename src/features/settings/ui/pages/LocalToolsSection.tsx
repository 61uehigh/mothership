import { CheckAgainButton, ExternalButton, SetupButton, Steps } from "@/features/settings/ui/SetupSteps";
import { CopyValue } from "@/features/settings/ui/setupChecklist";
import type { SettingsPageContext } from "@/features/settings/ui/settingsPages";
import { CheckCard, SettingsSection } from "@/features/settings/ui/settingsLayout";

/**
 * ### LocalToolsSection
 *
 * The GitHub CLI and Docker, with the steps to install, log in, or start each.
 */
export function LocalToolsSection({ view, recheck }: Pick<SettingsPageContext, "view" | "recheck">) {
  return (
    <SettingsSection
      title="Local tools"
      description="mothership uses these from your Mac; nothing to set up here unless one isn't ready."
      action={<CheckAgainButton onCheck={recheck} />}
    >
      <CheckCard label="GitHub CLI" purpose="For the GitHub section: pull requests, issues, and runs." check={view.tools.github}>
        {view.tools.github.fix === "install" && (
          <Steps>
            {[
              <>
                Install it with Homebrew: <CopyValue value="brew install gh" what="brew install gh" /> or{" "}
                <ExternalButton href="https://cli.github.com">download it</ExternalButton>
              </>,
              <>
                Then log in: <SetupButton action="gh-login" label="Log in to GitHub" />
              </>,
            ]}
          </Steps>
        )}
        {view.tools.github.fix === "login" && (
          <div>
            <SetupButton action="gh-login" label="Log in to GitHub" primary />
          </div>
        )}
      </CheckCard>
      <CheckCard label="Docker" purpose="For the Docker section: containers, logs, and actions." check={view.tools.docker}>
        {view.tools.docker.fix === "install" && (
          <Steps>
            {[
              <>
                Install Docker Desktop:{" "}
                <ExternalButton href="https://www.docker.com/products/docker-desktop/" primary>
                  Download
                </ExternalButton>
              </>,
              <>
                Open it once, then: <SetupButton action="docker-start" label="Start Docker" />
              </>,
            ]}
          </Steps>
        )}
        {view.tools.docker.fix === "start" && (
          <div>
            <SetupButton action="docker-start" label="Start Docker" primary />
          </div>
        )}
      </CheckCard>
    </SettingsSection>
  );
}
