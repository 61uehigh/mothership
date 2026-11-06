import { en, ko, type MessageKey } from "@/ui/i18n/messages";

/**
 * ### Locale
 *
 * The languages the UI is written in. English is the default.
 */
export type Locale = "en" | "ko";

/**
 * ### LOCALES
 *
 * Every locale with its name in its own language, the way a language picker shows it.
 */
export const LOCALES: ReadonlyArray<{ value: Locale; label: string }> = [
  { value: "en", label: "English" },
  { value: "ko", label: "한국어" },
];

const CATALOGS: Record<Locale, Record<MessageKey, string>> = { en, ko };

/** The `{name}` placeholders in a message. */
type Placeholders<S extends string> = S extends `${string}{${infer Name}}${infer Rest}` ? Name | Placeholders<Rest> : never;

/**
 * ### MessageParams
 *
 * What `t` needs after the key: nothing for a plain message, otherwise a
 * value for each `{name}` placeholder in its English text.
 */
export type MessageParams<K extends MessageKey> = [Placeholders<(typeof en)[K]>] extends [never] ? [] : [params: Record<Placeholders<(typeof en)[K]>, string | number>];

/**
 * ### Translate
 *
 * Looks up a message in the chosen language and fills in its placeholders.
 */
export type Translate = <K extends MessageKey>(key: K, ...params: MessageParams<K>) => string;

/**
 * ### translator
 *
 * @returns A {@link Translate} for `locale`.
 */
export function translator(locale: Locale): Translate {
  const catalog = CATALOGS[locale];
  return (key, ...[params]) => {
    const text = catalog[key];
    if (params === undefined) return text;
    const values = params as Record<string, string | number>;
    return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in values ? String(values[name]) : match));
  };
}

/**
 * ### isMessageKey
 *
 * Whether `key` is in the catalog: for text whose key is built at run time,
 * such as a command's group.
 */
export function isMessageKey(key: string): key is MessageKey {
  return Object.hasOwn(en, key);
}

/**
 * ### storedLabel
 *
 * Text saved as a catalog key (Insights stores a button by its label's key),
 * in the current language; any other saved text as it is.
 */
export function storedLabel(t: Translate, saved: string): string {
  // Saved keys are button labels, which take no parameters.
  return isMessageKey(saved) ? (t as (key: MessageKey) => string)(saved) : saved;
}
