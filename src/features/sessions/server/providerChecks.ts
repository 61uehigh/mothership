import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { z } from "zod";

/**
 * ### ProviderCheck
 *
 * Whether an agent provider can run, with what to do if not.
 */
export type ProviderCheck = { ready: boolean; detail: string; fix?: "login" };

const isSet = (name: string) => (process.env[name] ?? "") !== "";

/** Only the account fields shown in Settings; the rest of `~/.claude.json` is never read into the view. */
const claudeAccountSchema = z.object({ oauthAccount: z.object({ emailAddress: z.string() }).optional() });

async function claudeCheck(): Promise<ProviderCheck> {
  if (isSet("ANTHROPIC_API_KEY")) return { ready: true, detail: "Uses your Anthropic API key." };
  try {
    const account = claudeAccountSchema.safeParse(JSON.parse(await readFile(path.join(homedir(), ".claude.json"), "utf8")));
    const email = account.success ? account.data.oauthAccount?.emailAddress : undefined;
    if (email !== undefined) return { ready: true, detail: `Uses your Claude login (${email}).` };
  } catch {
    // No Claude Code config yet: not logged in.
  }
  return { ready: false, detail: "Log in with your Claude account, or add an Anthropic API key.", fix: "login" };
}

async function codexCheck(): Promise<ProviderCheck> {
  if (isSet("OPENAI_API_KEY")) return { ready: true, detail: "Uses your OpenAI API key." };
  const loggedIn = await stat(path.join(homedir(), ".codex", "auth.json")).then(
    () => true,
    () => false,
  );
  return loggedIn
    ? { ready: true, detail: "Uses your Codex login." }
    : { ready: false, detail: "Log in with your ChatGPT account, or add an OpenAI API key.", fix: "login" };
}

/**
 * ### checkProviders
 *
 * Reads only whether keys are set and logins exist; never a key's value.
 *
 * @returns Whether each agent provider can run.
 */
export async function checkProviders(): Promise<{ claude: ProviderCheck; openai: ProviderCheck; codex: ProviderCheck }> {
  const [claude, codex] = await Promise.all([claudeCheck(), codexCheck()]);
  const openai = isSet("OPENAI_API_KEY")
    ? { ready: true, detail: "Uses your OpenAI API key." }
    : { ready: false, detail: "Add an OpenAI API key to run OpenAI agents." };
  return { claude, openai, codex };
}
