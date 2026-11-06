import { readFile } from "node:fs/promises";
import type { SecretName } from "@/features/settings/model/Settings";
import { writeQueueFor, writeFileAtomic } from "@/platform/files";
import { HttpError } from "@/platform/http/HttpError";
import { dataPath } from "@/platform/paths";

/** Read on each write: `MOTHERSHIP_DATA_DIR` is fixed at startup, but tests may change it. */
const envFile = () => dataPath(".env.local");

/**
 * Characters a value may not contain. Values are written double-quoted, and
 * Next expands `$NAME` in `.env` values, so quotes, backslashes, `$`, and line
 * breaks could change what is read back.
 */
const UNSAFE = /["\\$\r\n\u0000-\u001f]/;

/**
 * ### upsertEnvLine
 *
 * Sets `name` in the text of an env file: replaces its line (the first one,
 * dropping repeats) or appends one. Other lines and comments are kept.
 *
 * @param value - The new value; empty leaves `NAME=` so the variable stays listed.
 * @returns The new file text.
 */
export function upsertEnvLine(text: string, name: string, value: string): string {
  const line = value === "" ? `${name}=` : `${name}="${value}"`;
  const pattern = new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=`);
  const lines = text === "" ? [] : text.replace(/\n$/, "").split("\n");
  let replaced = false;
  const next = lines.flatMap((current) => {
    if (!pattern.test(current)) return [current];
    if (replaced) return [];
    replaced = true;
    return [line];
  });
  if (!replaced) next.push(line);
  return `${next.join("\n")}\n`;
}


/**
 * ### writeSecret
 *
 * Saves a value to `.env.local` (readable only by you) and applies it to the
 * running server at once. The value is never logged or returned.
 *
 * @param value - Surrounding spaces are trimmed; empty clears the variable.
 * @throws {@link HttpError} 400 When the value has characters an env file cannot hold safely.
 */
export function writeSecret(name: SecretName, value: string): Promise<void> {
  const trimmed = value.trim();
  if (UNSAFE.test(trimmed)) {
    return Promise.reject(new HttpError("The value has a character that can't be saved: quotes, backslashes, $, or line breaks.", 400));
  }
  return writeQueueFor(envFile())(async () => {
    const current = await readFile(envFile(), "utf8").catch((error: unknown) => {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return "";
      throw error;
    });
    await writeFileAtomic(envFile(), upsertEnvLine(current, name, trimmed), { mode: 0o600 });
    if (trimmed === "") delete process.env[name];
    else process.env[name] = trimmed;
  });
}

/**
 * ### hasEnvFile
 *
 * @returns Whether `.env.local` exists; a fresh clone has only `.env.example`.
 */
export async function hasEnvFile(): Promise<boolean> {
  return readFile(envFile(), "utf8").then(
    () => true,
    () => false,
  );
}
