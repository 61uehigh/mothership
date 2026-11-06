"use client";

import { createContext, useContext } from "react";

/**
 * ### DeveloperModeContext
 *
 * Whether developer mode is on (Settings → Advanced), provided by the
 * Settings tab. Settings shows implementation details only then: the
 * `.env.local` names values are saved under and the link back to the config
 * files' choice.
 */
export const DeveloperModeContext = createContext(false);

/**
 * ### useDeveloperMode
 *
 * Reads {@link DeveloperModeContext}.
 */
export function useDeveloperMode(): boolean {
  return useContext(DeveloperModeContext);
}
