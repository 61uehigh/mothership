import type { AgentKind } from "@/features/sessions/model/AgentEvents";
import type { CheckResult } from "@/features/settings/model/Settings";
import type { Translate } from "@/ui/i18n/translate";

/**
 * ### CheckSubject
 *
 * What a {@link CheckResult} is about: an agent backend, or a CLI on this Mac.
 */
export type CheckSubject = AgentKind | "github" | "docker";

function claudeText(t: Translate, check: CheckResult): string | undefined {
  switch (check.reason) {
    case "api-key":
      return t("check.claude.apiKey");
    case "login":
      return check.account === undefined ? t("check.claude.login") : t("check.claude.loginAs", { account: check.account });
    case "login-expired":
      return check.account === undefined ? t("check.claude.loginExpired") : t("check.claude.loginExpiredAs", { account: check.account });
    case "not-logged-in":
      return t("check.claude.notLoggedIn");
  }
}

function codexText(t: Translate, check: CheckResult): string | undefined {
  switch (check.reason) {
    case "api-key":
      return t("check.codex.apiKey");
    case "login":
      return t("check.codex.login");
    case "login-expired":
      return t("check.codex.loginExpired");
    case "not-logged-in":
      return t("check.codex.notLoggedIn");
  }
}

function githubText(t: Translate, check: CheckResult): string | undefined {
  switch (check.reason) {
    case "login":
      return check.account === undefined ? undefined : t("check.github.loginAs", { account: check.account });
    case "not-installed":
      return t("check.github.notInstalled");
    case "not-logged-in":
      return t("check.github.notLoggedIn");
  }
}

function dockerText(t: Translate, check: CheckResult): string | undefined {
  switch (check.reason) {
    case "running":
      return t("check.docker.running", { version: check.version ?? "" });
    case "not-installed":
      return t("check.docker.notInstalled");
    case "not-running":
      return t("check.docker.notRunning");
  }
}

const BY_SUBJECT: Record<CheckSubject, (t: Translate, check: CheckResult) => string | undefined> = {
  claude: claudeText,
  codex: codexText,
  github: githubText,
  docker: dockerText,
};

/**
 * ### checkText
 *
 * Whether an agent or a CLI is ready, and what to do if not, in the chosen
 * language. A `failed` check shows the tool's own message inside our sentence.
 */
export function checkText(t: Translate, subject: CheckSubject, check: CheckResult): string {
  if (check.reason === "failed") return t("check.failed", { error: check.error ?? "" });
  // A reason this subject never sends still gets a line, not an empty one.
  return BY_SUBJECT[subject](t, check) ?? (check.ready ? t("check.ready") : t("check.notReady"));
}
