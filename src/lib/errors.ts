/**
 * ### errorMessage
 *
 * @param error - Anything a `catch` received.
 * @returns The message of an `Error`, otherwise the value as a string.
 */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
