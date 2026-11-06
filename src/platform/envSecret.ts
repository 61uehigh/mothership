/**
 * ### envSecret
 *
 * @returns The value of a key or token in `.env.local`, or `undefined` when it is unset or empty
 *   (the .env template leaves keys as empty strings).
 */
export function envSecret(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value === "" ? undefined : value;
}

/**
 * ### hasEnvSecret
 *
 * Whether {@link envSecret} has a value for `name`.
 */
export function hasEnvSecret(name: string): boolean {
  return envSecret(name) !== undefined;
}
