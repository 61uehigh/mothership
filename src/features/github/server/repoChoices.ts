import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { dataPath } from "@/platform/paths";
import type { AccountRepo, LocalRepo, RepoList } from "@/features/github/model/GitHub";
import { gh, ghJson } from "@/features/github/server/gh";
import { listLocalRepos } from "@/features/github/server/localRepos";

const file = () => dataPath(".mothership", "github-repos.json");
const ACCOUNT_TTL_MS = 5 * 60_000;
const ACCOUNT_LIMIT = "200";

const choicesSchema = z.object({
  /** Repositories added from your account (no local checkout needed). */
  added: z.array(z.string()).default([]),
  /** Local repositories you removed from the list. */
  hidden: z.array(z.string()).default([]),
});
type Choices = z.infer<typeof choicesSchema>;

async function readChoices(): Promise<Choices> {
  try {
    return choicesSchema.parse(JSON.parse(await readFile(file(), "utf8")));
  } catch {
    // Missing or hand-broken file: start from no choices rather than failing the section.
    return { added: [], hidden: [] };
  }
}

/** The chain of pending writes, so two quick changes cannot overwrite each other. */
let writes: Promise<unknown> = Promise.resolve();

function updateChoices(change: (choices: Choices) => Choices): Promise<Choices> {
  const result = writes.then(async () => {
    const next = change(await readChoices());
    await mkdir(path.dirname(file()), { recursive: true });
    // A temporary file and a rename, so a crash never leaves a half-written file.
    const temporary = `${file()}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`);
    await rename(temporary, file());
    return next;
  });
  writes = result.catch(() => undefined);
  return result;
}

/**
 * ### listRepos
 *
 * The GitHub section's repositories: local checkouts (see `listLocalRepos`)
 * minus the ones you removed, then the ones you added from your account.
 *
 * @param extraDirs - More local folders to check.
 */
export async function listRepos(extraDirs: Array<string> = []): Promise<RepoList> {
  const [local, choices] = await Promise.all([listLocalRepos(extraDirs), readChoices()]);
  const shown = local.filter((r) => !choices.hidden.includes(r.repo));
  const known = new Set(local.map((r) => r.repo));
  const added = choices.added.filter((repo) => !known.has(repo)).map((repo): LocalRepo => ({ repo, dir: undefined, source: "added" }));
  return { repos: [...shown, ...added], hidden: choices.hidden.filter((repo) => known.has(repo)) };
}

/**
 * ### changeRepos
 *
 * `add` puts a repository from your account in the list; `remove` takes one
 * out (an added one is forgotten, a local one is hidden); `restore` shows a
 * hidden local one again.
 */
export async function changeRepos(action: "add" | "remove" | "restore", repo: string): Promise<void> {
  await updateChoices((choices) => {
    const without = (list: Array<string>) => list.filter((r) => r !== repo);
    switch (action) {
      case "add":
        return { added: [...without(choices.added), repo], hidden: without(choices.hidden) };
      case "remove":
        return choices.added.includes(repo)
          ? { ...choices, added: without(choices.added) }
          : { ...choices, hidden: [...without(choices.hidden), repo] };
      case "restore":
        return { ...choices, hidden: without(choices.hidden) };
    }
  });
}

const accountRepoSchema = z.array(
  z
    .object({
      nameWithOwner: z.string(),
      description: z.string().nullish(),
      isPrivate: z.boolean(),
      updatedAt: z.string(),
    })
    .transform(
      (r): AccountRepo => ({ repo: r.nameWithOwner, description: r.description ?? undefined, isPrivate: r.isPrivate, updatedAt: r.updatedAt }),
    ),
);
let accountCache: { at: number; repos: Array<AccountRepo> } | undefined;

/**
 * ### listAccountRepos
 *
 * Repositories you own and those of your organizations, most recently
 * updated first, through `gh repo list`. Cached for five minutes.
 *
 * @param refresh - Bypass the cache.
 * @throws {@link GhError} When `gh` fails.
 */
export async function listAccountRepos(refresh: boolean): Promise<Array<AccountRepo>> {
  if (!refresh && accountCache !== undefined && Date.now() - accountCache.at < ACCOUNT_TTL_MS) return accountCache.repos;
  const orgs = (await gh(["api", "user/orgs", "--jq", ".[].login"])).split("\n").filter((login) => login.trim() !== "");
  const lists = await Promise.all(
    [undefined, ...orgs].map((owner) =>
      ghJson(
        ["repo", "list", ...(owner === undefined ? [] : [owner]), "--limit", ACCOUNT_LIMIT, "--json", "nameWithOwner,description,isPrivate,updatedAt"],
        accountRepoSchema,
      ),
    ),
  );
  const repos = [...new Map(lists.flat().map((r) => [r.repo, r])).values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  accountCache = { at: Date.now(), repos };
  return repos;
}
