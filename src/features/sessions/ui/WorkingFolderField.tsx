"use client";

import { FolderField } from "@/ui/FolderField";
import { FIELD_CLASS } from "@/features/sessions/ui/newAgentFields";
import { type RepoProbe, isNotARepo } from "@/features/sessions/ui/repoProbe";
import { useT } from "@/ui/i18n/useT";

/**
 * ### WorkingFolderField
 *
 * The New session dialog's folder field: suggests known repositories, shows
 * the default folder as its placeholder, and says under it whether the folder
 * is a git repository.
 */
export function WorkingFolderField({
  repo,
  onChange,
  onError,
  defaultFolder,
  repositories,
  probe,
}: {
  repo: string;
  onChange: (repo: string) => void;
  onError: (message: string | undefined) => void;
  defaultFolder: string | undefined;
  repositories: Array<string>;
  /** The last check of `repo`; `undefined` until one answers. */
  probe: RepoProbe | undefined;
}) {
  const t = useT();
  const notARepo = isNotARepo(probe);
  return (
    <label className="flex flex-col gap-1 text-xs text-zinc-500">
      {t("sessions.new.folder")}
      <FolderField
        className={`${FIELD_CLASS} font-mono`}
        placeholder={defaultFolder === undefined ? undefined : t("sessions.new.folderDefault", { folder: defaultFolder })}
        list="repository-suggestions"
        value={repo}
        onChange={onChange}
        onError={onError}
      />
      <datalist id="repository-suggestions">
        {repositories.map((dir) => (
          <option key={dir} value={dir} />
        ))}
      </datalist>
      {/* Left empty, the default folder is used as it is; only a folder you typed gets a warning. */}
      <span className={(probe?.error !== undefined || probe?.problem !== undefined) && repo.trim() !== "" ? "text-red-600 dark:text-red-400" : notARepo && repo.trim() !== "" ? "text-amber-600" : ""}>
        {probe?.error !== undefined && repo.trim() !== ""
          ? t("sessions.new.folderCheckFailed", { error: probe.error })
          : probe?.problem !== undefined && repo.trim() !== ""
          ? t(`apiError.${probe.problem}`)
          : probe === undefined || repo.trim() === ""
          ? t("sessions.new.folderEmptyHint")
          : notARepo
            ? t("sessions.new.notARepo")
            : t("sessions.new.gitRepo", { root: probe.root ?? "" })}
      </span>
    </label>
  );
}
