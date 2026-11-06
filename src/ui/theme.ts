"use client";

import { useEffect } from "react";
import { useStoredState } from "@/ui/useStoredState";

/**
 * ### THEME_KEY
 *
 * localStorage key for the chosen theme. The pre-paint script in `layout.tsx`
 * reads it too, so the theme applies before React hydrates.
 */
export const THEME_KEY = "mothership.theme";

/**
 * ### Theme
 *
 * Dark is the default; light is opt-in, and auto follows the system's setting.
 */
export type Theme = "dark" | "light" | "auto";

const SYSTEM_DARK = "(prefers-color-scheme: dark)";

/**
 * ### THEME_SCRIPT
 *
 * Runs before first paint: applies a saved light theme, or the system's
 * setting for auto, otherwise keeps the default dark class, so the page never
 * flashes the wrong theme.
 */
export const THEME_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||(t==="auto"&&!matchMedia("${SYSTEM_DARK}").matches))document.documentElement.classList.remove("dark")}catch(e){}`;

const parseTheme = (raw: string): Theme | undefined => (raw === "light" || raw === "dark" || raw === "auto" ? raw : undefined);

const applyDark = (dark: boolean) => document.documentElement.classList.toggle("dark", dark);

/**
 * ### useTheme
 *
 * Keeps `<html>`'s dark class in step with the chosen theme; for auto, also
 * with the system's setting as it changes.
 *
 * @returns The chosen theme and a setter that applies and remembers it.
 */
export function useTheme(): { theme: Theme; setTheme: (theme: Theme) => void } {
  const [theme, setTheme] = useStoredState<Theme>(THEME_KEY, "dark", parseTheme);

  useEffect(() => {
    if (theme !== "auto") {
      applyDark(theme === "dark");
      return;
    }
    const system = matchMedia(SYSTEM_DARK);
    const follow = () => applyDark(system.matches);
    follow();
    system.addEventListener("change", follow);
    return () => system.removeEventListener("change", follow);
  }, [theme]);

  return { theme, setTheme };
}
