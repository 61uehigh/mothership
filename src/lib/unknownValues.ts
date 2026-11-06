/**
 * ### asRecord
 *
 * Reads parsed JSON or an SDK payload typed `unknown` without casts at every step.
 *
 * @returns `value` when it is a plain object (not an array or `null`), else `undefined`.
 */
export function asRecord(value: unknown): Record<string, unknown> | undefined {
  // Narrowed to a non-array object, so the cast only names its value type.
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

/**
 * ### valueAt
 *
 * @returns The value under `keys` in nested objects, e.g. `valueAt(reply, "result", "id")`;
 *   `undefined` as soon as a step is missing or not an object.
 */
export function valueAt(value: unknown, ...keys: Array<string>): unknown {
  let current = value;
  for (const key of keys) current = asRecord(current)?.[key];
  return current;
}

/**
 * ### stringAt
 *
 * @returns The string under `key`, or `undefined` when it is missing, not a string, or empty.
 */
export function stringAt(value: unknown, key: string): string | undefined {
  const found = asRecord(value)?.[key];
  return typeof found === "string" && found !== "" ? found : undefined;
}

/**
 * ### textOf
 *
 * @returns Message content as plain text, as Claude and Codex both shape it:
 *   a string as it is, or the `text` of each block of an array joined by
 *   newlines (blocks without text are skipped).
 */
export function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => {
      const text = asRecord(block)?.text;
      return typeof text === "string" ? text : "";
    })
    .filter((text) => text !== "")
    .join("\n");
}
