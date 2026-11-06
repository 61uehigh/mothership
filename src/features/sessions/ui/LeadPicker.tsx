"use client";

import { AGENT_KIND_LABELS, AGENT_KINDS, EFFORTS, type AgentKind, type Effort } from "@/features/sessions/model/AgentEvents";
import { leadDefaults, leadLimits, modelChoices, type LeadChoice, type LeadOptions } from "@/features/sessions/model/Lead";
import { checkText } from "@/shell/checkText";
import { leadLimitText } from "@/shell/leadLimitText";
import { useT } from "@/ui/i18n/useT";
import { FIELD_CLASS } from "@/features/sessions/ui/newAgentFields";
import { SegmentedControl } from "@/ui/SegmentedControl";
import { SELECTED_SEGMENT, UNSELECTED_SEGMENT } from "@/ui/selection";

const isEffort = (value: string): value is Effort => EFFORTS.some((effort) => effort === value);

/**
 * ### LeadPicker
 *
 * Who runs the session, on the face of the New session dialog: Claude or
 * Codex, its model, and its effort. A backend that isn't ready is shown disabled with the reason and a
 * way to Settings → Agents; what a non-Claude lead can't do is listed under it.
 *
 * @param lead - Whether the session is a lead (the lead role or none); else the picker is for the role's agent, and the lead's limits are not listed.
 * @param onOpenSettings - Opens Settings → Agents.
 */
export function LeadPicker({
  value,
  onChange,
  options,
  lead,
  onOpenSettings,
}: {
  value: LeadChoice;
  onChange: (choice: LeadChoice) => void;
  /** `undefined` while loading: every backend counts as ready and only defaults are offered. */
  options: LeadOptions | undefined;
  lead: boolean;
  onOpenSettings: () => void;
}) {
  const t = useT();
  const kinds: ReadonlyArray<AgentKind> = AGENT_KINDS;
  const readiness = (kind: AgentKind) => options?.readiness[kind];
  const notReady = readiness(value.provider)?.ready === false ? readiness(value.provider) : undefined;
  const models = modelChoices(value.provider, options, value.model);
  const limits = lead ? leadLimits(value.provider) : [];

  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1 text-xs text-zinc-500">{lead ? t("sessions.common.lead") : t("sessions.common.agent")}</legend>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
        <SegmentedControl
          label={lead ? t("sessions.common.lead") : t("sessions.common.agent")}
          value={value.provider}
          options={kinds.map((kind) => {
            const check = readiness(kind);
            const off = check?.ready === false && kind !== value.provider;
            return {
              value: kind,
              label: AGENT_KIND_LABELS[kind],
              title: check === undefined ? undefined : check.ready ? checkText(t, kind, check) : t("sessions.lead.notReadyTitle", { detail: checkText(t, kind, check) }),
              disabled: off,
            };
          })}
          onChange={(kind) => onChange(leadDefaults(kind))}
          className="flex rounded-md bg-zinc-100 p-0.5 dark:bg-zinc-800"
          optionClassName={(selected) => `rounded px-3 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-40 ${selected ? SELECTED_SEGMENT : UNSELECTED_SEGMENT}`}
        />
        <select
          aria-label={t("sessions.common.model")}
          className={FIELD_CLASS}
          value={value.model ?? ""}
          onChange={(e) => onChange({ ...value, model: e.target.value === "" ? undefined : e.target.value })}
        >
          <option value="">{value.provider === "codex" ? t("sessions.lead.defaultModelCodex") : t("sessions.lead.defaultModel")}</option>
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <select
          aria-label={t("sessions.lead.effort")}
          className={`${FIELD_CLASS} col-span-2 sm:col-span-1`}
          value={value.effort ?? ""}
          onChange={(e) => onChange({ ...value, effort: isEffort(e.target.value) ? e.target.value : undefined })}
        >
          <option value="">{t("sessions.lead.defaultEffort")}</option>
          {EFFORTS.map((x) => (
            <option key={x} value={x}>
              {t("sessions.lead.effortLevel", { effort: x })}
            </option>
          ))}
        </select>
      </div>
      {notReady !== undefined && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {t("sessions.lead.notReady", { name: AGENT_KIND_LABELS[value.provider], detail: checkText(t, value.provider, notReady) })}{" "}
          <button type="button" className="underline hover:no-underline" onClick={onOpenSettings}>
            {t("sessions.lead.openSettings")}
          </button>
        </p>
      )}
      {kinds.some((kind) => readiness(kind)?.ready === false && kind !== value.provider) && notReady === undefined && (
        <p className="text-[11px] text-zinc-500">
          {t("sessions.lead.othersNotReady", {
            names: kinds
              .filter((kind) => readiness(kind)?.ready === false)
              .map((kind) => AGENT_KIND_LABELS[kind])
              .join(", "),
          })}{" "}
          <button type="button" className="underline hover:no-underline" onClick={onOpenSettings}>
            {t("sessions.lead.setUp")}
          </button>
        </p>
      )}
      {limits.length > 0 && (
        <ul className="list-disc pl-5 text-[11px] text-zinc-500">
          {limits.map((limit) => (
            <li key={limit}>{leadLimitText(t, value.provider, limit)}</li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}
