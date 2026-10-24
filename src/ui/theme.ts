"use client";

import { useCallback } from "react";
import { useStoredState } from "@/ui/useStoredState";

/**
 * ### THEME_KEY
 *
 * localStorage key for the chosen theme. Read by the pre-paint script in
 * `layout.tsx`, so keep the two in sync.
 */
export const THEME_KEY = "mothership.theme";

/**
 * ### Theme
 *
 * Dark is the default; light is opt-in.
 */
export type Theme = "dark" | "light";

/**
 * ### THEME_SCRIPT
 *
 * Runs before first paint: applies a saved light theme, otherwise keeps the
 * default dark class, so the page never flashes the wrong theme.
 */
export const THEME_SCRIPT = `try{if(localStorage.getItem("${THEME_KEY}")==="light")document.documentElement.classList.remove("dark")}catch(e){}`;

const parseTheme = (raw: string): Theme | undefined => (raw === "light" || raw === "dark" ? raw : undefined);

/**
 * ### useTheme
 *
 * @returns The current theme and a toggle that applies and remembers it.
 */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useStoredState<Theme>(THEME_KEY, "dark", parseTheme);

  // The pre-paint script applies the saved theme on load; a toggle applies it here.
  const toggle = useCallback(() => {
    const next: Theme = document.documentElement.classList.contains("dark") ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    setTheme(next);
  }, [setTheme]);

  return { theme, toggle };
}
