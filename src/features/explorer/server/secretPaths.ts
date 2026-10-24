/** Folders whose contents are secrets: never listed, never read. */
const SECRET_DIRS = new Set([".ssh", ".aws", ".azure", ".gnupg", ".kube", ".password-store", ".docker", "Keychains", ".terraform.d", ".codex"]);
/** Folders under `.config` that hold tokens. */
const SECRET_CONFIG_DIRS = new Set(["gh", "gcloud", "op", "hub", "configstore", "github-copilot"]);
/**
 * Secret files by name: `.env` and variants (but not `.env.example`), any
 * `credentials` file (`.git-credentials`, `.credentials.json`,
 * `credentials.toml`, …), token files, shell histories and startup files
 * (they often hold pasted or exported tokens), package-manager and tool
 * configs with auth tokens, and private keys.
 */
const SECRET_FILE =
  /^(\.env(\..+)?|\.envrc|\.netrc|\.npmrc|\.yarnrc\.yml|\.pypirc|\.pgpass|\.vault-token|\.terraformrc|\.(zsh|bash)rc|\.(zsh|bash_)?profile|\.zshenv|\.zlogin|\.?[\w-]*credentials(\.(json|toml|ya?ml|ini|cfg|conf|txt))?|[\w.-]*token(s)?(\.json)?|\.?\w*_history|\.histfile|id_(rsa|ed25519|ecdsa|dsa)|.+\.(pem|key|p12|pfx|keystore|jks))$/i;
const SECRET_EXCEPTIONS = new Set([".env.example", ".env.sample", ".env.template"]);

/**
 * ### isSecretPath
 *
 * Paths mothership refuses to show anywhere, so the UI never displays
 * credentials: key and token folders (`.ssh`, `.aws`, …, `.config/gh`) and
 * files such as `.env`, `.netrc`, or `*.pem`. `.env.example` stays visible.
 *
 * @param target - Absolute or relative path.
 */
export function isSecretPath(target: string): boolean {
  const parts = target.split(/[\\/]/).filter(Boolean);
  // A repository's .git/config can hold remotes with a token in the URL.
  if (parts.some((part, i) => part === ".git" && parts[i + 1] === "config")) return true;
  if (parts.some((part) => SECRET_DIRS.has(part))) return true;
  if (parts.some((part, i) => part === ".config" && SECRET_CONFIG_DIRS.has(parts[i + 1] ?? ""))) return true;
  const name = parts.at(-1) ?? "";
  return SECRET_FILE.test(name) && !SECRET_EXCEPTIONS.has(name.toLowerCase());
}
