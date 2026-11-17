// The guard that keeps your settings, secrets, and data out of a packaged app.

/** Never part of the app: env files (but the example), the data folder, git history, and your own config. */
const PRIVATE = [/(^|\/)\.env(?!\.example)/, /(^|\/)\.mothership(\/|$)/, /^server\/\.git(\/|$)/, /^server\/config\/(dashboard|repositories|keybindings)\.yaml$/];

/**
 * ### isPrivateFile
 *
 * Whether a file staged for the app is one of yours that must not ship:
 * any `.env` file but `.env.example`, anything in a `.mothership` data
 * folder, the server's `.git`, or the config files Settings writes
 * (`dashboard`, `repositories`, `keybindings`). The default config the app
 * ships with (`mcp.yaml`) is not.
 *
 * @param {string} file - A path relative to the staging folder, with `/` on every OS.
 * @returns {boolean}
 */
export function isPrivateFile(file) {
  return PRIVATE.some((pattern) => pattern.test(file));
}
