import { describeSourceProblem } from "@/features/settings/model/connectionDiagnosis";
import { toolErrorCodeOf, unavailableReasonOf, type ToolKind } from "@/features/tools/model/Dashboard";
import { sourceProblemSummary } from "@/shell/connectionProblemText";
import { unavailableText } from "@/shell/unavailableText";
import { apiErrorText } from "@/ui/i18n/apiErrors";
import type { Locale, Translate } from "@/ui/i18n/translate";
import type { ApiFailure } from "@/ui/useJson";

/**
 * ### ToolFailure
 *
 * A failed read or write of a work tool, as a route or a collection reports it:
 * its `code` and `params` when it has them, and the English `message`.
 */
export type ToolFailure = { code: string | undefined; params: Readonly<Record<string, unknown>> | undefined; message: string };

/**
 * ### toolUnavailableText
 *
 * Why the tool is not set up, in the chosen language, for views whose other
 * failures are not the tool's (e.g. Claude's, while summarizing a note).
 *
 * @returns `undefined` when the failure is not the tool being unavailable.
 */
export function toolUnavailableText(t: Translate, locale: Locale, failure: Pick<ToolFailure, "code" | "params">): string | undefined {
  const reason = unavailableReasonOf(failure.code, failure.params);
  return reason === undefined ? undefined : unavailableText(t, locale, reason);
}

/**
 * ### toolFailureText
 *
 * A work tool's failure in the chosen language: why it is not set up, a
 * worded API error, or a recognized connection problem; the English message
 * only for anything else.
 *
 * @param tool - The tool that failed, to name it and to diagnose its raw errors.
 */
export function toolFailureText(t: Translate, locale: Locale, failure: ToolFailure, tool: ToolKind): string {
  const unavailable = toolUnavailableText(t, locale, failure);
  if (unavailable !== undefined) return unavailable;
  const worded = apiErrorText(failure.code, locale, failure.params);
  if (worded !== undefined) return worded;
  const connector = failure.params?.connector;
  const known = { code: toolErrorCodeOf(failure.code), ...(typeof connector === "string" ? { connector } : {}) };
  return sourceProblemSummary(t, describeSourceProblem(tool, failure.message, known), failure.message);
}

/**
 * ### toolLoadError
 *
 * {@link toolFailureText} for a failed call to a route that reads or writes a work tool.
 *
 * @returns `undefined` when there is no failure.
 */
export function toolLoadError(t: Translate, locale: Locale, failure: ApiFailure | undefined, tool: ToolKind): string | undefined {
  return failure === undefined ? undefined : toolFailureText(t, locale, { code: failure.code, params: failure.params, message: failure.error }, tool);
}
