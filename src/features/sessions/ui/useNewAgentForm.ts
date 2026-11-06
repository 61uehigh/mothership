"use client";

import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useStoredState } from "@/ui/useStoredState";
import type { AgentKind, Effort } from "@/features/sessions/model/AgentEvents";
import type { NewAgentDraft } from "@/features/sessions/model/NewAgentDraft";
import type { Role } from "@/features/sessions/model/Roles";
import type { LeadChoice } from "@/features/sessions/model/Lead";
import { DEFAULT_ROLE, leadsSession } from "@/features/sessions/ui/newAgentFields";

const LAST_REPO_KEY = "mothership.lastRepo";

const parseLastRepo = (raw: string): string => raw;

type Setter<T> = Dispatch<SetStateAction<T>>;

/**
 * ### NewAgentForm
 *
 * What you have filled in on the New session dialog, with a setter per field.
 * Fields are kept as typed; trimming and dropping empty values happen on submit.
 */
export type NewAgentForm = {
  /** The working folder; empty falls back to the default folder. */
  repo: string;
  setRepo: Setter<string>;
  worktree: boolean;
  setWorktree: Setter<boolean>;
  /** The Compare run box as ticked; it is ignored outside a git repository. */
  compare: boolean;
  setCompare: Setter<boolean>;
  allowGit: boolean;
  setAllowGit: Setter<boolean>;
  /** The providers a compare run starts. */
  attempts: Array<AgentKind>;
  setAttempts: Setter<Array<AgentKind>>;
  name: string;
  setName: Setter<string>;
  /** A role name, or `""` for none. */
  role: string;
  provider: AgentKind;
  setProvider: Setter<AgentKind>;
  model: string;
  setModel: Setter<string>;
  effort: Effort | "";
  setEffort: Setter<Effort | "">;
  /** MCP servers the session gets; `undefined` means all enabled servers. */
  mcp: Array<string> | undefined;
  /** The task. */
  initialMessage: string;
  setInitialMessage: Setter<string>;
  /**
   * Picks a role and, when `roles` has it, takes its provider, model, effort, MCP
   * servers, and worktree setting. A lead takes the provider, model, and effort
   * of your default lead instead, once it is known.
   */
  applyRole: (roleName: string, roles: Array<Role>) => void;
  /** Picks who runs the session in the lead picker. */
  pickLead: (choice: LeadChoice) => void;
  /** Sets your default lead once loaded; applied unless a role other than lead was picked or you already picked a lead. */
  takeDefaultLead: (choice: LeadChoice) => void;
  /** Remembers a folder as the next dialog's starting folder. */
  rememberRepo: (repo: string) => void;
};

/**
 * ### useNewAgentForm
 *
 * The New session dialog's form state, started from `draft` where it has a
 * value, and the folder from last time otherwise.
 */
export function useNewAgentForm(draft: NewAgentDraft | undefined): NewAgentForm {
  // An empty folder falls back to the default folder.
  const [lastRepo, setLastRepo] = useStoredState(LAST_REPO_KEY, "", parseLastRepo);
  const [repo, setRepo] = useState(() => draft?.repo ?? lastRepo);
  const [worktree, setWorktree] = useState(draft?.worktree ?? false);
  const [compare, setCompare] = useState(false);
  const [allowGit, setAllowGit] = useState(false);
  const [attempts, setAttempts] = useState<Array<AgentKind>>(["claude", "codex"]);
  const [name, setName] = useState(draft?.name ?? "");
  const [role, setRole] = useState(DEFAULT_ROLE);
  const [provider, setProvider] = useState<AgentKind>("claude");
  const [model, setModel] = useState("");
  const [effort, setEffort] = useState<Effort | "">("");
  const [mcp, setMcp] = useState<Array<string> | undefined>(undefined);
  const [initialMessage, setInitialMessage] = useState(draft?.initialMessage ?? "");
  // Read inside handlers only, so refs: the default lead arrives on its own schedule, and a lead picked by hand wins over it.
  const defaultLead = useRef<LeadChoice | undefined>(undefined);
  const leadPicked = useRef(false);
  const roleRef = useRef(role);

  function setLead(choice: LeadChoice) {
    setProvider(choice.provider);
    setModel(choice.model ?? "");
    setEffort(choice.effort ?? "");
  }

  function applyRole(roleName: string, roles: Array<Role>) {
    setRole(roleName);
    roleRef.current = roleName;
    const preset = roles.find((r) => r.name === roleName);
    if (preset === undefined) {
      setMcp(undefined);
      if (roleName === "" && defaultLead.current !== undefined && !leadPicked.current) setLead(defaultLead.current);
      return;
    }
    if (leadsSession(roleName) && defaultLead.current !== undefined) {
      if (!leadPicked.current) setLead(defaultLead.current);
    } else setLead({ provider: preset.provider, model: preset.model, effort: preset.effort });
    setMcp(preset.mcp);
    setWorktree(preset.worktree);
  }

  function pickLead(choice: LeadChoice) {
    leadPicked.current = true;
    setLead(choice);
  }

  function takeDefaultLead(choice: LeadChoice) {
    defaultLead.current = choice;
    if (leadsSession(roleRef.current) && !leadPicked.current) setLead(choice);
  }

  return {
    repo,
    setRepo,
    worktree,
    setWorktree,
    compare,
    setCompare,
    allowGit,
    setAllowGit,
    attempts,
    setAttempts,
    name,
    setName,
    role,
    provider,
    setProvider,
    model,
    setModel,
    effort,
    setEffort,
    mcp,
    initialMessage,
    setInitialMessage,
    applyRole,
    pickLead,
    takeDefaultLead,
    rememberRepo: setLastRepo,
  };
}
