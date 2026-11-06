import { dockerEn, dockerKo } from "@/ui/i18n/catalog/docker";
import { explorerEn, explorerKo } from "@/ui/i18n/catalog/explorer";
import { feedbackEn, feedbackKo } from "@/ui/i18n/catalog/feedback";
import { githubEn, githubKo } from "@/ui/i18n/catalog/github";
import { insightsEn, insightsKo } from "@/ui/i18n/catalog/insights";
import { sessionsEn, sessionsKo } from "@/ui/i18n/catalog/sessions";
import { serverEn, serverKo } from "@/ui/i18n/catalog/server";
import { settingsEn, settingsKo } from "@/ui/i18n/catalog/settings";
import { shellEn, shellKo } from "@/ui/i18n/catalog/shell";
import { todosEn, todosKo } from "@/ui/i18n/catalog/todos";
import { toolsEn, toolsKo } from "@/ui/i18n/catalog/tools";
import { uiEn, uiKo } from "@/ui/i18n/catalog/ui";

/**
 * ### en
 *
 * The UI's English text, by key, gathered from one catalog per area in
 * `catalog/`. A `{name}` in a message is filled in from the params given to
 * `t` (see `useT`). Text that comes from tools (Slack, Linear, mail, …) is
 * never in here: it shows as the tool sends it.
 */
export const en = {
  ...uiEn,
  ...shellEn,
  ...settingsEn,
  ...sessionsEn,
  ...todosEn,
  ...githubEn,
  ...dockerEn,
  ...explorerEn,
  ...toolsEn,
  ...insightsEn,
  ...feedbackEn,
  ...serverEn,
} as const;

/**
 * ### MessageKey
 *
 * A key of the UI's text catalog.
 */
export type MessageKey = keyof typeof en;

/**
 * ### ko
 *
 * The UI's Korean text. Each area's Korean catalog is typed against its
 * English one, so a missing or extra key fails the type check. Product and
 * app names stay as they are.
 */
export const ko: Record<MessageKey, string> = {
  ...uiKo,
  ...shellKo,
  ...settingsKo,
  ...sessionsKo,
  ...todosKo,
  ...githubKo,
  ...dockerKo,
  ...explorerKo,
  ...toolsKo,
  ...insightsKo,
  ...feedbackKo,
  ...serverKo,
};
