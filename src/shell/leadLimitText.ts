import { AGENT_KIND_LABELS, type AgentKind } from "@/features/sessions/model/AgentEvents";
import type { LeadLimit } from "@/features/sessions/model/Lead";
import type { Translate } from "@/ui/i18n/translate";

/**
 * ### leadLimitText
 *
 * Words one of `kind`'s {@link LeadLimit}s for the lead pickers in the New
 * session dialog and Settings → Agents.
 */
export function leadLimitText(t: Translate, kind: AgentKind, limit: LeadLimit): string {
  switch (limit) {
    case "subagents":
      return t("sessions.lead.limitSubagents", { name: AGENT_KIND_LABELS[kind] });
    case "git":
      return t("sessions.lead.limitGit");
    case "connectors":
      return t("sessions.lead.limitConnectors");
  }
}
