import type { ReactNode } from "react";
import type { CheckResult, SettingsView } from "@/features/settings/model/Settings";
import { SecretField } from "@/features/settings/ui/SecretField";
import { CheckAgainButton, SetupButton } from "@/features/settings/ui/setupSteps";
import type { SettingsPageContext } from "@/features/settings/ui/settingsPages";
import { ReadyDot, ReadyText, SETTINGS_INPUT, SETTINGS_SAVE_BUTTON, SaveStatus, useSave } from "@/features/settings/ui/settingsLayout";
import { PageSection } from "@/ui/PageSection";
import { FolderField } from "@/ui/FolderField";
import { useT } from "@/ui/i18n/useT";
import { checkText } from "@/shell/checkText";
import { leadLimitText } from "@/shell/leadLimitText";
import { useJson } from "@/ui/useJson";
import { useState } from "react";
import { SegmentedControl } from "@/ui/SegmentedControl";
import { SELECTED_SEGMENT, UNSELECTED_SEGMENT } from "@/ui/selection";
import { AGENT_KIND_LABELS, AGENT_KINDS, EFFORTS, type AgentKind, type Effort } from "@/features/sessions/model/AgentEvents";
import { leadDefaults, leadLimits, modelChoices, sameLead, type LeadChoice, type LeadOptions } from "@/features/sessions/model/Lead";

/** A select of the default-lead row: one fixed height with the provider switch, and a filled background so the native control and its menu follow the theme. */
const LEAD_SELECT = "h-7 rounded-md border border-zinc-300 bg-white px-2 text-xs dark:border-zinc-700 dark:bg-zinc-900";

const isEffort = (value: string): value is Effort => EFFORTS.some((effort) => effort === value);

/** One account's card, such as OpenAI's, with a status line for each kind of agent it runs. */
function AccountCard({ label, agents, children }: { label: string; agents: Array<{ kind: AgentKind; check: CheckResult }>; children?: ReactNode }) {
  const t = useT();
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <p className="text-sm">{label}</p>
      <ul className="flex flex-col gap-1">
        {agents.map(({ kind, check }) => (
          <li key={kind} className="flex items-start gap-2">
            <ReadyDot ready={check.ready} />
            <p className="min-w-0 break-words text-xs text-zinc-500">
              <span className="text-zinc-700 dark:text-zinc-300">{AGENT_KIND_LABELS[kind]}</span> <ReadyText ready={check.ready} />
              {checkText(t, kind, check)}
            </p>
          </li>
        ))}
      </ul>
      {children}
    </div>
  );
}

function DefaultFolderForm({ view, onSave }: { view: SettingsView; onSave: (folder: string) => Promise<string | undefined> }) {
  const t = useT();
  const [folder, setFolder] = useState(view.defaultFolder.chosen ?? "");
  const { state, save, fail } = useSave(onSave);
  const unchanged = folder.trim() === (view.defaultFolder.chosen ?? "");

  return (
    <form
      className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
      onSubmit={(event) => {
        event.preventDefault();
        void save(folder.trim());
      }}
    >
      <FolderField
        className={`${SETTINGS_INPUT} font-mono`}
        placeholder={t("settings.agents.homeFolderPlaceholder", { folder: view.defaultFolder.fallback })}
        value={folder}
        onChange={setFolder}
        onError={fail}
      />
      <div className="flex items-center gap-2">
        <button type="submit" disabled={state.busy || unchanged} className={SETTINGS_SAVE_BUTTON}>
          {t("settings.save")}
        </button>
        {view.defaultFolder.chosen !== undefined && (
          <button
            type="button"
            disabled={state.busy}
            className="rounded-md px-2 py-1 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
            onClick={() => {
              setFolder("");
              void save("");
            }}
          >
            {t("settings.agents.useHomeFolder")}
          </button>
        )}
        <SaveStatus state={state} />
      </div>
    </form>
  );
}

/** Who leads new sessions; the New session dialog starts with it and saves the lead you start with. */
function DefaultLeadForm({ view, onSave }: { view: SettingsView; onSave: (lead: LeadChoice) => Promise<string | undefined> }) {
  const t = useT();
  const [lead, setLead] = useState<LeadChoice>(view.lead);
  const options = useJson<LeadOptions>("/api/leads").data;
  const { state, save } = useSave(onSave);
  const check = view.agents[lead.provider];
  const limits = leadLimits(lead.provider);

  return (
    <form
      className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
      onSubmit={(event) => {
        event.preventDefault();
        void save(lead);
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl
          label={t("settings.agents.lead")}
          value={lead.provider}
          options={AGENT_KINDS.map((kind) => ({ value: kind, label: AGENT_KIND_LABELS[kind] }))}
          onChange={(kind) => setLead(leadDefaults(kind))}
          className="flex h-7 rounded-md bg-zinc-100 p-0.5 dark:bg-zinc-800"
          optionClassName={(selected) => `rounded px-2.5 text-xs ${selected ? SELECTED_SEGMENT : UNSELECTED_SEGMENT}`}
        />
        <select
          aria-label={t("settings.agents.model")}
          className={`${LEAD_SELECT} min-w-0 flex-1 sm:max-w-64`}
          value={lead.model ?? ""}
          onChange={(e) => setLead({ ...lead, model: e.target.value === "" ? undefined : e.target.value })}
        >
          <option value="">{lead.provider === "codex" ? t("settings.agents.defaultModelCodex") : t("settings.agents.defaultModel")}</option>
          {modelChoices(lead.provider, options, lead.model).map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <select
          aria-label={t("settings.agents.effort")}
          className={`${LEAD_SELECT} w-36`}
          value={lead.effort ?? ""}
          onChange={(e) => setLead({ ...lead, effort: isEffort(e.target.value) ? e.target.value : undefined })}
        >
          <option value="">{t("settings.agents.defaultEffort")}</option>
          {EFFORTS.map((x) => (
            <option key={x} value={x}>
              {t("settings.agents.effortLevel", { effort: x })}
            </option>
          ))}
        </select>
      </div>
      {!check.ready && <p className="text-xs text-amber-700 dark:text-amber-400">{t("settings.agents.leadNotReady", { name: AGENT_KIND_LABELS[lead.provider], detail: checkText(t, lead.provider, check) })}</p>}
      {limits.length > 0 && (
        <ul className="list-disc pl-5 text-xs text-zinc-500">
          {limits.map((limit) => (
            <li key={limit}>{leadLimitText(t, lead.provider, limit)}</li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <button type="submit" disabled={state.busy || sameLead(lead, view.lead)} className={SETTINGS_SAVE_BUTTON}>
          {t("settings.save")}
        </button>
        <SaveStatus state={state} />
      </div>
    </form>
  );
}

/** One on/off choice, saved as soon as it changes. */
function SettingToggle({ checked, label, onSave }: { checked: boolean; label: string; onSave: (on: boolean) => Promise<string | undefined> }) {
  const { state, save } = useSave(onSave);
  return (
    <div className="flex items-center gap-2 rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={checked} disabled={state.busy} onChange={(e) => void save(e.target.checked)} />
        {label}
      </label>
      <SaveStatus state={state} />
    </div>
  );
}

/**
 * ### AgentsPage
 *
 * Which agents you can run, the keys they use, and the folder a new session works in.
 */
export function AgentsPage({ view, send, saveSecret, recheck }: SettingsPageContext) {
  const t = useT();
  const secretOf = (name: string) => view.agentSecrets.find((s) => s.name === name) ?? { name, set: false };
  return (
    <>
      <PageSection description={t("settings.agents.description")} action={<CheckAgainButton onCheck={recheck} />}>
        <AccountCard label="Anthropic" agents={[{ kind: "claude", check: view.agents.claude }]}>
          {!secretOf("ANTHROPIC_API_KEY").set && (
            <div>
              <SetupButton action="claude-login" label={view.agents.claude.ready ? t("settings.agents.switchAccount") : t("settings.agents.loginClaude")} primary={!view.agents.claude.ready} />
            </div>
          )}
          <SecretField
            secret={secretOf("ANTHROPIC_API_KEY")}
            label={t("settings.agents.anthropicKey")}
            placeholder="sk-ant-…"
            onSave={(v) => saveSecret("ANTHROPIC_API_KEY", v)}
          />
        </AccountCard>
        <AccountCard
          label="OpenAI"
          agents={[{ kind: "codex", check: view.agents.codex }]}
        >
          {!secretOf("OPENAI_API_KEY").set && (
            <div>
              <SetupButton action="codex-login" label={view.agents.codex.ready ? t("settings.agents.switchAccount") : t("settings.agents.loginChatGpt")} primary={!view.agents.codex.ready} />
            </div>
          )}
          <SecretField
            secret={secretOf("OPENAI_API_KEY")}
            label={t("settings.agents.openaiKey")}
            placeholder="sk-…"
            onSave={(v) => saveSecret("OPENAI_API_KEY", v)}
          />
        </AccountCard>
      </PageSection>
      <PageSection
        title={t("settings.agents.defaultLead")}
        description={t("settings.agents.defaultLeadDescription")}
      >
        <DefaultLeadForm view={view} onSave={(lead) => send("/api/settings", "PATCH", { lead })} />
      </PageSection>
      <PageSection
        title={t("settings.agents.afterRestart")}
        description={t("settings.agents.afterRestartDescription")}
      >
        <SettingToggle
          checked={view.autoContinue}
          label={t("settings.agents.autoContinue")}
          onSave={(on) => send("/api/settings", "PATCH", { autoContinue: on })}
        />
      </PageSection>
      <PageSection title={t("settings.agents.promptSuggestions")} description={t("settings.agents.promptSuggestionsDescription")}>
        <SettingToggle
          checked={view.promptSuggestions}
          label={t("settings.agents.promptSuggestionsToggle")}
          onSave={(on) => send("/api/settings", "PATCH", { promptSuggestions: on })}
        />
      </PageSection>
      <PageSection title={t("settings.agents.defaultFolder")} description={t("settings.agents.defaultFolderDescription")}>
        <DefaultFolderForm view={view} onSave={(folder) => send("/api/settings", "PATCH", { defaultFolder: folder })} />
      </PageSection>
    </>
  );
}
