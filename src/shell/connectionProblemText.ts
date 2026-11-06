import type { ConnectionChip } from "@/features/settings/model/connectionStatus";
import { connectionToolName, type ConnectionCause, type ConnectionProblem, type SourceProblem } from "@/features/settings/model/connectionDiagnosis";
import type { Translate } from "@/ui/i18n/translate";

/**
 * ### chipLabel
 *
 * A status chip's words in the chosen language.
 */
export function chipLabel(t: Translate, state: ConnectionChip["state"]): string {
  switch (state) {
    case "checking":
      return t("settings.chip.checking");
    case "off":
      return t("settings.chip.off");
    case "not-set-up":
      return t("settings.chip.notSetUp");
    case "needs-sign-in":
      return t("settings.chip.needsSignIn");
    case "expired":
      return t("settings.chip.expired");
    case "not-tested":
      return t("settings.chip.notTested");
    case "connected":
      return t("settings.chip.connected");
    case "not-working":
      return t("settings.chip.notWorking");
    case "waiting":
      return t("settings.chip.waiting");
  }
}

type ProblemText = {
  label: (t: Translate, problem: ConnectionProblem) => string;
  summary: (t: Translate, problem: ConnectionProblem, tool: string) => string;
  detail?: (t: Translate, problem: ConnectionProblem) => string;
};

/** Every cause's wording, one entry each, so a new cause fails the type check until it is worded. */
const PROBLEM_TEXT: Record<ConnectionCause, ProblemText> = {
  "mcp-access": {
    label: (t) => t("settings.problemLabel.mcpAccess"),
    summary: (t) => t("settings.problem.mcpAccess"),
    detail: (t) => t("settings.problem.mcpAccessDetail"),
  },
  "api-disabled": {
    label: (t) => t("settings.problemLabel.apiDisabled"),
    summary: (t, p) => t("settings.problem.apiDisabled", { api: p.api ?? "API" }),
    detail: (t, p) => (p.project === undefined ? t("settings.problem.apiDisabledDetail") : t("settings.problem.apiDisabledDetailProject", { project: p.project })),
  },
  "org-internal": {
    label: (t) => t("settings.problemLabel.orgInternal"),
    summary: (t) => t("settings.problem.orgInternal"),
    detail: (t) => t("settings.problem.orgInternalDetail"),
  },
  "no-channel": {
    label: (t) => t("settings.problemLabel.noChannel"),
    summary: (t) => t("settings.problem.noChannel"),
    detail: (t) => t("settings.problem.noChannelDetail"),
  },
  client: {
    label: (t) => t("settings.problemLabel.client"),
    summary: (t) => t("settings.problem.client"),
    detail: (t) => t("settings.problem.clientDetail"),
  },
  expired: {
    label: (t) => t("settings.problemLabel.expired"),
    summary: (t) => t("settings.problem.expired"),
    detail: (t) => t("settings.problem.expiredDetail"),
  },
  signin: {
    label: (t) => t("settings.problemLabel.signin"),
    summary: (t) => t("settings.problem.signin"),
  },
  quota: {
    label: (t) => t("settings.problemLabel.quota"),
    summary: (t, p) => (p.variant === "youtube" ? t("settings.problem.quotaYouTube") : t("settings.problem.quota", { api: p.api ?? "API" })),
    detail: (t, p) => (p.variant === "youtube" ? t("settings.problem.quotaYouTubeDetail") : t("settings.problem.quotaDetail", { api: p.api ?? "API" })),
  },
  scope: {
    label: (t, p) => (p.variant === "gmail" ? t("settings.problemLabel.noMailAccess") : t("settings.problemLabel.scope")),
    summary: (t, p) => {
      if (p.variant === "gmail") return t("settings.problem.gmailScope");
      return p.scope === undefined ? t("settings.problem.scopeUnknown") : t("settings.problem.scope", { scope: p.scope });
    },
    detail: (t, p) => {
      if (p.variant === "gmail") return t("settings.problem.gmailScopeDetail");
      return p.variant === "slack" ? t("settings.problem.scopeSlackDetail") : t("settings.problem.scopeDetail");
    },
  },
  token: {
    label: (t) => t("settings.problemLabel.token"),
    summary: (t, _p, tool) => t("settings.problem.token", { tool }),
    detail: (t) => t("settings.problem.tokenDetail"),
  },
  "rate-limited": {
    label: (t) => t("settings.problemLabel.rateLimited"),
    summary: (t, p, tool) => (p.variant === "retrying" ? t("settings.problem.rateLimitedRetrying", { tool }) : t("settings.problem.rateLimited", { tool })),
  },
  start: {
    label: (t) => t("settings.problemLabel.start"),
    summary: (t, _p, tool) => t("settings.problem.start", { tool }),
    detail: (t) => t("settings.problem.startDetail"),
  },
  network: {
    label: (t) => t("settings.problemLabel.network"),
    summary: (t, _p, tool) => t("settings.problem.network", { tool }),
  },
  connector: {
    label: (t) => t("settings.problemLabel.connector"),
    summary: (t, p, tool) => t("settings.problem.connector", { connector: p.connector ?? tool }),
  },
  "claude-login": {
    label: (t) => t("settings.problemLabel.claudeLogin"),
    summary: (t, _p, tool) => t("settings.problem.claudeLogin", { tool }),
  },
  "claude-limit": {
    label: (t) => t("settings.problemLabel.claudeLimit"),
    summary: (t, _p, tool) => t("settings.problem.claudeLimit", { tool }),
  },
};

/**
 * ### problemSummary
 *
 * A diagnosed failure's one line, what is wrong and what to do, in the chosen language.
 *
 * @param tool - The tool's name as its card shows it, e.g. `Linear`.
 */
export function problemSummary(t: Translate, problem: ConnectionProblem, tool: string): string {
  return PROBLEM_TEXT[problem.cause].summary(t, problem, tool);
}

/**
 * ### problemDetail
 *
 * More about a diagnosed failure in the chosen language, for Details.
 *
 * @returns `undefined` for causes the summary already says all of.
 */
export function problemDetail(t: Translate, problem: ConnectionProblem): string | undefined {
  return PROBLEM_TEXT[problem.cause].detail?.(t, problem);
}

/**
 * ### problemLabel
 *
 * A diagnosed failure's few words (e.g. "Key refused") in the chosen language,
 * for places with room for a label only.
 */
export function problemLabel(t: Translate, problem: ConnectionProblem): string {
  return PROBLEM_TEXT[problem.cause].label(t, problem);
}

/**
 * ### sourceProblemSummary
 *
 * A source's failure in one line: the diagnosed problem's summary, else the raw message.
 */
export function sourceProblemSummary(t: Translate, { card, problem }: SourceProblem, message: string): string {
  return problem === undefined || card === undefined ? message : problemSummary(t, problem, connectionToolName(card));
}

/**
 * ### sourceProblemLabel
 *
 * A source's failure in a few words: the diagnosed problem's label, else the raw message.
 */
export function sourceProblemLabel(t: Translate, { problem }: SourceProblem, message: string): string {
  return problem === undefined ? message : problemLabel(t, problem);
}
