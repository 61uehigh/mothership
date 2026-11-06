"use client";

import { useEffect, useState } from "react";
import type { Role } from "@/features/sessions/model/Roles";
import { fetchJson } from "@/ui/useJson";
import { useT } from "@/ui/i18n/useT";

/**
 * ### NewAgentChoices
 *
 * The lists the New session dialog offers, empty until loaded.
 */
export type NewAgentChoices = {
  roles: Array<Role>;
  /** Folders suggested for the working folder. */
  repositories: Array<string>;
  /** Where the session works when the folder is left empty (from Settings). */
  defaultFolder: string | undefined;
  /** Why a list could not be loaded; the dialog still works with what did load. */
  error: string | undefined;
};

/**
 * ### useNewAgentChoices
 *
 * Loads the suggested folders, the default folder, and the roles once, when
 * the dialog opens.
 *
 * @param onRolesLoaded - Called once with the roles as soon as they arrive, so a
 *   role can be applied from the list before the next render. Only the first
 *   render's callback is used.
 */
export function useNewAgentChoices(onRolesLoaded: (roles: Array<Role>) => void): NewAgentChoices {
  const t = useT();
  const [roles, setRoles] = useState<Array<Role>>([]);
  const [repositories, setRepositories] = useState<Array<string>>([]);
  const [defaultFolder, setDefaultFolder] = useState<string | undefined>(undefined);
  const [repositoriesError, setRepositoriesError] = useState<string | undefined>(undefined);
  const [rolesError, setRolesError] = useState<string | undefined>(undefined);

  useEffect(() => {
    void fetchJson<{ repositories: Array<string>; defaultFolder: string }>("/api/repositories").then((result) => {
      if (!result.ok) {
        setRepositoriesError(t("sessions.new.foldersFailed", { error: result.error }));
        return;
      }
      setRepositories(result.data.repositories);
      setDefaultFolder(result.data.defaultFolder);
    });
    // Runs once on open, in the language of that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void fetchJson<Array<Role>>("/api/roles").then((result) => {
      if (!result.ok) {
        setRolesError(t("sessions.new.rolesFailed", { error: result.error }));
        return;
      }
      setRoles(result.data);
      onRolesLoaded(result.data);
    });
    // Runs once on open, with the first render's `onRolesLoaded` (see above).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { roles, repositories, defaultFolder, error: [rolesError, repositoriesError].filter(Boolean).join("\n") || undefined };
}
