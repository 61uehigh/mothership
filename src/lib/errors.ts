/**
 * ### errorMessage
 *
 * @param error - Anything a `catch` received.
 * @returns The message of an `Error`, otherwise the value as a string.
 */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * ### toError
 *
 * @param error - Anything a `catch` or a rejection handler received.
 * @returns The same `Error` when it is one, otherwise a new one with its text.
 */
export function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(errorMessage(error));
}

/**
 * ### isMissingFile
 *
 * @returns Whether a file system error means the file or folder does not exist (`ENOENT`).
 */
export function isMissingFile(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
