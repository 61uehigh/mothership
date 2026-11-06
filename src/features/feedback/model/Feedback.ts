import { z } from "zod";

/** A PNG screenshot as a data URL; about 6 MB at most. */
const SCREENSHOT_MAX = 8_000_000;

/**
 * ### feedbackSchema
 *
 * Feedback on mothership's own screen, sent from developer mode: what you
 * want changed, where on screen, and what the page knew at the time.
 */
export const feedbackSchema = z.object({
  /** What you want changed, in your words. */
  text: z.string().trim().min(1).max(4000),
  /** The open tab, e.g. `tab:pr`, or `none`. */
  screen: z.string().max(120),
  /** The element you picked, when you picked one. */
  target: z
    .object({
      /** The screen area around it, e.g. `sidebar:slack` (see `data-usage-area`). */
      area: z.string().max(80),
      /** A CSS path to it from the page root. */
      path: z.string().max(600),
      /** Its visible text, shortened. */
      text: z.string().max(300),
      /** Its accessible name or title, if any. */
      label: z.string().max(200),
    })
    .optional(),
  /** The window, or the picked element, as a PNG data URL. */
  screenshot: z.string().startsWith("data:image/png;base64,").max(SCREENSHOT_MAX).optional(),
  /** Recent errors in the page: uncaught exceptions and failed API calls. */
  pageErrors: z.array(z.string().max(1000)).max(20),
  viewport: z.object({ width: z.number().int().positive(), height: z.number().int().positive(), theme: z.enum(["light", "dark"]) }),
});

/**
 * ### FeedbackInput
 *
 * See {@link feedbackSchema}.
 */
export type FeedbackInput = z.infer<typeof feedbackSchema>;

/**
 * ### DebugInfo
 *
 * What the debug panel shows about the running app.
 */
export type DebugInfo = {
  /** The desktop app (true) or `pnpm dev` from a checkout. */
  packaged: boolean;
  dataDir: string;
  node: string;
  developer: {
    enabled: boolean;
    /** The mothership checkout feedback sessions work on. */
    source: string | undefined;
    branch: string | undefined;
    /** The checkout's current commit, e.g. `8d57241 feat: …`. */
    commit: string | undefined;
    /** Files changed but not committed in the checkout. */
    changedFiles: number | undefined;
  };
  /** The last lines of the server log. */
  log: Array<string>;
};
