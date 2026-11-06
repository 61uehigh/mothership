import type { FilesErrorCode } from "@/features/explorer/model/Files";
import { isMessageKey, type Translate } from "@/ui/i18n/translate";
import type { ApiFailure } from "@/ui/useJson";

/**
 * ### filesFailureText
 *
 * A refused `/api/files` request in the chosen language, from its `code`.
 *
 * @param path - The path that was asked for, as the Explorer or the file tab shows it.
 * @returns The route's own text for a failure without an Explorer code
 *   (`session-not-found`, which `fetchJson` already words, the network, or a
 *   code this build doesn't know).
 */
export function filesFailureText(t: Translate, failure: ApiFailure<FilesErrorCode>, path: string): string {
  const key = `explorer.failure.${failure.code ?? ""}`;
  return isMessageKey(key) ? (t as (key: string, params: { path: string }) => string)(key, { path }) : failure.error;
}
