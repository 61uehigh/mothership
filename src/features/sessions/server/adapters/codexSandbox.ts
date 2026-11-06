/**
 * ### GITHUB_DOMAINS
 *
 * The hosts a Codex session with "Allow git" may reach: git over HTTPS, the
 * GitHub API (`gh`), and the hosts GitHub serves files and releases from.
 * `**.` matches subdomains only; the apex is listed on its own.
 */
export const GITHUB_DOMAINS = ["github.com", "**.github.com", "**.githubusercontent.com"] as const;

/**
 * ### CodexSandbox
 *
 * How one Codex turn's `workspace-write` sandbox is loosened, if at all.
 *
 * @property networkAccessEnabled - The SDK thread option; network stays off when `false`.
 * @property configOverrides - Raw `--config key=value` arguments. Raw, because the SDK's
 *   structured `config` splits keys on dots and so cannot name a host like `github.com`.
 */
export type CodexSandbox = { networkAccessEnabled: boolean; configOverrides: Array<string> };

/**
 * ### codexSandbox
 *
 * A session without "Allow git" keeps the sandbox closed: no network, and the
 * git directory read-only (Codex protects it even inside the working directory).
 * With it, the session may write its git directories (to commit), and reach
 * the network only through Codex's proxy, which lets {@link GITHUB_DOMAINS}
 * through and refuses every other host. Without the proxy, turning network
 * access on would open every host.
 *
 * @param allowGit - The session's "Allow git" choice.
 * @param gitDirs - Absolute git directories of the working directory (its own and the
 *   repository's common one, which differ in a worktree); empty outside a repository.
 * @returns The thread option and config arguments for the turn.
 */
export function codexSandbox(allowGit: boolean, gitDirs: ReadonlyArray<string>): CodexSandbox {
  if (!allowGit) return { networkAccessEnabled: false, configOverrides: [] };
  const domains = GITHUB_DOMAINS.map((domain) => `${JSON.stringify(domain)}="allow"`).join(",");
  return {
    networkAccessEnabled: true,
    configOverrides: [
      "features.network_proxy.enabled=true",
      `features.network_proxy.domains={${domains}}`,
      ...(gitDirs.length === 0 ? [] : [`sandbox_workspace_write.writable_roots=[${[...new Set(gitDirs)].map((dir) => JSON.stringify(dir)).join(",")}]`]),
    ],
  };
}
