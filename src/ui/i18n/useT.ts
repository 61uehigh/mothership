"use client";

import { useCallback, useMemo } from "react";
import { translator, type Locale, type Translate } from "@/ui/i18n/translate";
import { useStoredState } from "@/ui/useStoredState";

/**
 * ### LOCALE_KEY
 *
 * localStorage key for the chosen language. The pre-paint script in
 * `layout.tsx` reads it too, to set `<html lang>` before React hydrates.
 */
export const LOCALE_KEY = "mothership.locale";

/**
 * ### LOCALE_SCRIPT
 *
 * Runs before first paint: sets `<html lang>` to the saved language, so
 * Korean text gets Korean line breaking and fonts from the start. The text
 * itself switches when React hydrates; the page is prerendered in English.
 */
export const LOCALE_SCRIPT = `try{if(localStorage.getItem("${LOCALE_KEY}")==="ko")document.documentElement.lang="ko"}catch(e){}`;

const parseLocale = (raw: string): Locale | undefined => (raw === "en" || raw === "ko" ? raw : undefined);

/**
 * ### useLocale
 *
 * The UI's language, remembered in this browser. Every component using it
 * re-renders when it changes.
 *
 * @returns The chosen language and a setter that applies and remembers it.
 */
export function useLocale(): { locale: Locale; setLocale: (locale: Locale) => void } {
  const [locale, store] = useStoredState<Locale>(LOCALE_KEY, "en", parseLocale);
  const setLocale = useCallback(
    (next: Locale) => {
      store(next);
      document.documentElement.lang = next;
    },
    [store],
  );
  return { locale, setLocale };
}

/**
 * ### useT
 *
 * @returns A {@link Translate} for the chosen language; a new function when
 *   the language changes, so memos that list it in their deps recompute.
 */
export function useT(): Translate {
  const { locale } = useLocale();
  return useMemo(() => translator(locale), [locale]);
}
