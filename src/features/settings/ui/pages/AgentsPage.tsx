import type { ReactNode } from "react";
import type { CheckResult, SettingsView } from "@/features/settings/model/Settings";
import { SecretField } from "@/features/settings/ui/SecretField";
import { CheckAgainButton, SetupButton } from "@/features/settings/ui/SetupSteps";
import type { SettingsPageContext } from "@/features/settings/ui/settingsPages";
import { ReadyDot, ReadyText, SETTINGS_INPUT, SETTINGS_SAVE_BUTTON, SaveStatus, SettingsSection, useSave } from "@/features/settings/ui/settingsLayout";
import { FolderField } from "@/ui/FolderField";
import { useJson } from "@/ui/useJson";
import { useState } from "react";
import { AGENT_KIND_LABELS, AGENT_KINDS, EFFORTS, type AgentKind, type Effort } from "@/features/sessions/model/AgentEvents";
import { leadDefaults, leadLimits, modelChoices, sameLead, type LeadChoice, type LeadOptions } from "@/features/sessions/model/Lead";

const isEffort = (value: string): value is Effort => EFFORTS.some((effort) => effort === value);

/** One account's card, such as OpenAI's, with a status line for each kind of agent it runs. */
function AccountCard({ label, agents, children }: { label: string; agents: Array<{ name: string; check: CheckResult }>; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <p className="text-sm">{label}</p>
      <ul className="flex flex-col gap-1">
        {agents.map(({ name, check }) => (
          <li key={name} className="flex items-start gap-2">
            <ReadyDot ready={check.ready} />
            <p className="min-w-0 break-words text-xs text-zinc-500">
              <span className="text-zinc-700 dark:text-zinc-300">{name}</span> <ReadyText ready={check.ready} />
              {check.detail}
            </p>
          </li>
        ))}
      </ul>
      {children}
    </div>
  );
}

function DefaultFolderForm({ view, onSave }: { view: SettingsView; onSave: (folder: string) => Promise<string | undefined> }) {
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
        placeholder={`${view.defaultFolder.fallback} (your home folder)`}
        value={folder}
        onChange={setFolder}
        onError={fail}
      />
      <div className="flex items-center gap-2">
        <button type="submit" disabled={state.busy || unchanged} className={SETTINGS_SAVE_BUTTON}>
          Save
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
            Use home folder
          </button>
        )}
        <SaveStatus state={state} />
      </div>
    </form>
  );
}

/** Who leads new sessions; the New session dialog starts with it and saves the lead you start with. */
function DefaultLeadForm({ view, onSave }: { view: SettingsView; onSave: (lead: LeadChoice) => Promise<string | undefined> }) {
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
      <div className="grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
        <select
          aria-label="Lead"
          className={SETTINGS_INPUT}
          value={lead.provider}
          onChange={(e) => {
            const kind = AGENT_KINDS.find((k: AgentKind) => k === e.target.value);
            if (kind !== undefined) setLead(leadDefaults(kind));
          }}
        >
          {AGENT_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {AGENT_KIND_LABELS[kind]}
            </option>
          ))}
        </select>
        <select
          aria-label="Model"
          className={SETTINGS_INPUT}
          value={lead.model ?? ""}
          onChange={(e) => setLead({ ...lead, model: e.target.value === "" ? undefined : e.target.value })}
        >
          <option value="">{lead.provider === "codex" ? "Default model (Codex config)" : "Default model"}</option>
          {modelChoices(lead.provider, options, lead.model).map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Effort"
          className={SETTINGS_INPUT}
          value={lead.effort ?? ""}
          onChange={(e) => setLead({ ...lead, effort: isEffort(e.target.value) ? e.target.value : undefined })}
        >
          <option value="">Default effort</option>
          {EFFORTS.map((x) => (
            <option key={x} value={x}>
              {x} effort
            </option>
          ))}
        </select>
      </div>
      {!check.ready && <p className="text-xs text-amber-700 dark:text-amber-400">{AGENT_KIND_LABELS[lead.provider]} isn&apos;t ready: {check.detail} New sessions start with another lead until it is.</p>}
      {limits.length > 0 && (
        <ul className="list-disc pl-5 text-xs text-zinc-500">
          {limits.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <button type="submit" disabled={state.busy || sameLead(lead, view.lead)} className={SETTINGS_SAVE_BUTTON}>
          Save
        </button>
        <SaveStatus state={state} />
      </div>
    </form>
  );
}

/**
 * ### AgentsPage
 *
 * Which agents you can run, the keys they use, and the folder a new session works in.
 */
export function AgentsPage({ view, send, saveSecret, recheck }: SettingsPageContext) {
  const secretOf = (name: string) => view.agentSecrets.find((s) => s.name === name) ?? { name, set: false };
  return (
    <>
      <SettingsSection title="Agents" description="At least one is needed to start sessions." action={<CheckAgainButton onCheck={recheck} />}>
        <AccountCard label="Anthropic" agents={[{ name: "Claude", check: view.agents.claude }]}>
          {!secretOf("ANTHROPIC_API_KEY").set && (
            <div>
              <SetupButton action="claude-login" label={view.agents.claude.ready ? "Switch account" : "Log in to Claude"} primary={!view.agents.claude.ready} />
            </div>
          )}
          <SecretField
            secret={secretOf("ANTHROPIC_API_KEY")}
            label="Anthropic API key (optional; Claude uses it instead of your Claude login)"
            placeholder="sk-ant-…"
            onSave={(v) => saveSecret("ANTHROPIC_API_KEY", v)}
          />
        </AccountCard>
        <AccountCard
          label="OpenAI"
          agents={[{ name: "Codex", check: view.agents.codex }]}
        >
          {!secretOf("OPENAI_API_KEY").set && (
            <div>
              <SetupButton action="codex-login" label={view.agents.codex.ready ? "Switch account" : "Log in with ChatGPT"} primary={!view.agents.codex.ready} />
            </div>
          )}
          <SecretField
            secret={secretOf("OPENAI_API_KEY")}
            label="OpenAI API key (optional; Codex uses it instead of your ChatGPT login)"
            placeholder="sk-…"
            onSave={(v) => saveSecret("OPENAI_API_KEY", v)}
          />
        </AccountCard>
      </SettingsSection>
      <SettingsSection
        title="Default lead"
        description="Who takes on a new session, including hand-offs from the sidebars, to-dos, and pull requests. The New session dialog starts with it, and the lead you start a session with becomes the new default."
      >
        <DefaultLeadForm view={view} onSave={(lead) => send("/api/settings", "PATCH", { lead })} />
      </SettingsSection>
      <SettingsSection title="Default folder" description="Where a new session works when you leave its folder empty. Your home folder until you choose one.">
        <DefaultFolderForm view={view} onSave={(folder) => send("/api/settings", "PATCH", { defaultFolder: folder })} />
      </SettingsSection>
    </>
  );
}
