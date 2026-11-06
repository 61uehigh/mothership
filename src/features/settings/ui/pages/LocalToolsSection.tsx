import { CheckAgainButton, ExternalButton, SetupButton, Steps } from "@/features/settings/ui/setupSteps";
import { CopyValue } from "@/features/settings/ui/setupChecklist";
import type { SettingsPageContext } from "@/features/settings/ui/settingsPages";
import { CheckCard } from "@/features/settings/ui/settingsLayout";
import { PageSection } from "@/ui/PageSection";
import { useT } from "@/ui/i18n/useT";

/**
 * ### LocalToolsSection
 *
 * The GitHub CLI and Docker, with the steps to install, log in, or start each.
 */
export function LocalToolsSection({ view, recheck }: Pick<SettingsPageContext, "view" | "recheck">) {
  const t = useT();
  return (
    <PageSection
      title={t("settings.local.title")}
      description={t("settings.local.description")}
      action={<CheckAgainButton onCheck={recheck} />}
    >
      <CheckCard label="GitHub CLI" purpose={t("settings.local.githubPurpose")} subject="github" check={view.tools.github}>
        {view.tools.github.fix === "install" && (
          <Steps>
            {[
              <>
                {t("settings.local.installBrew")} <CopyValue value="brew install gh" what="brew install gh" /> {t("settings.local.or")}{" "}
                <ExternalButton href="https://cli.github.com">{t("settings.local.downloadIt")}</ExternalButton>
              </>,
              <>
                {t("settings.local.thenLogIn")} <SetupButton action="gh-login" label={t("settings.local.loginGithub")} />
              </>,
            ]}
          </Steps>
        )}
        {view.tools.github.fix === "login" && (
          <div>
            <SetupButton action="gh-login" label={t("settings.local.loginGithub")} primary />
          </div>
        )}
      </CheckCard>
      <CheckCard label="Docker" purpose={t("settings.local.dockerPurpose")} subject="docker" check={view.tools.docker}>
        {view.tools.docker.fix === "install" && (
          <Steps>
            {[
              <>
                {t("settings.local.installDocker")}{" "}
                <ExternalButton href="https://www.docker.com/products/docker-desktop/" primary>
                  {t("settings.local.download")}
                </ExternalButton>
              </>,
              <>
                {t("settings.local.openOnce")} <SetupButton action="docker-start" label={t("settings.local.startDocker")} />
              </>,
            ]}
          </Steps>
        )}
        {view.tools.docker.fix === "start" && (
          <div>
            <SetupButton action="docker-start" label={t("settings.local.startDocker")} primary />
          </div>
        )}
      </CheckCard>
    </PageSection>
  );
}
