import { z } from "zod";

/** A PNG screenshot as a data URL; about 6 MB at most. */
export const SCREENSHOT_MAX = 8_000_000;
/** The longest feedback text, in characters. */
export const FEEDBACK_TEXT_MAX = 4000;
/** The longest open-tab name. */
export const SCREEN_MAX = 120;
/** The longest screen-area name of a picked element. */
export const TARGET_AREA_MAX = 80;
/** The longest CSS path to a picked element. */
export const TARGET_PATH_MAX = 600;
/** The longest visible text of a picked element. */
export const TARGET_TEXT_MAX = 300;
/** The longest accessible name of a picked element. */
export const TARGET_LABEL_MAX = 200;
/** The longest page error, its time included. */
export const PAGE_ERROR_MAX = 1000;
/** The most page errors sent. */
export const PAGE_ERRORS_MAX = 20;

/**
 * ### feedbackSchema
 *
 * Feedback on mothership's own screen, sent from developer mode: what you
 * want changed, where on screen, and what the page knew at the time.
 */
export const feedbackSchema = z.object({
  /** What you want changed, in your words. */
  text: z.string().trim().min(1).max(FEEDBACK_TEXT_MAX),
  /** The open tab, e.g. `tab:pr`, or `none`. */
  screen: z.string().max(SCREEN_MAX),
  /** The element you picked, when you picked one. */
  target: z
    .object({
      /** The screen area around it, e.g. `sidebar:slack` (see `data-usage-area`). */
      area: z.string().max(TARGET_AREA_MAX),
      /** A CSS path to it from the page root. */
      path: z.string().max(TARGET_PATH_MAX),
      /** Its visible text, shortened. */
      text: z.string().max(TARGET_TEXT_MAX),
      /** Its accessible name or title, if any. */
      label: z.string().max(TARGET_LABEL_MAX),
    })
    .optional(),
  /** The window, or the picked element, as a PNG data URL. */
  screenshot: z.string().startsWith("data:image/png;base64,").max(SCREENSHOT_MAX).optional(),
  /** Recent errors in the page: uncaught exceptions and failed API calls. */
  pageErrors: z.array(z.string().max(PAGE_ERROR_MAX)).max(PAGE_ERRORS_MAX),
  viewport: z.object({ width: z.number().int().positive(), height: z.number().int().positive(), theme: z.enum(["light", "dark"]) }),
});

/**
 * ### FeedbackInput
 *
 * See {@link feedbackSchema}.
 */
export type FeedbackInput = z.infer<typeof feedbackSchema>;

/**
 * ### FeedbackDraft
 *
 * What the page gathered for feedback, before it is fitted to {@link feedbackSchema}'s limits.
 */
export type FeedbackDraft = Omit<FeedbackInput, "pageErrors"> & {
  /** The page's recent errors, oldest first, with when each happened (epoch milliseconds). */
  pageErrors: ReadonlyArray<{ at: number; message: string }>;
};

/**
 * ### feedbackInput
 *
 * Fits what the page gathered into {@link feedbackSchema}'s limits, so a long
 * stack trace or a long label never makes feedback impossible to send: each
 * part is cut after the time is put in front of an error, only the newest
 * errors are kept, and a screenshot too large to send is left out.
 *
 * @param time - Words an error's time, e.g. `toLocaleTimeString`.
 */
export function feedbackInput(draft: FeedbackDraft, time: (at: number) => string): FeedbackInput {
  const { target, screenshot } = draft;
  return {
    text: draft.text.slice(0, FEEDBACK_TEXT_MAX),
    screen: draft.screen.slice(0, SCREEN_MAX),
    target:
      target === undefined
        ? undefined
        : {
            area: target.area.slice(0, TARGET_AREA_MAX),
            path: target.path.slice(0, TARGET_PATH_MAX),
            text: target.text.slice(0, TARGET_TEXT_MAX),
            label: target.label.slice(0, TARGET_LABEL_MAX),
          },
    screenshot: screenshot !== undefined && screenshot.length <= SCREENSHOT_MAX ? screenshot : undefined,
    pageErrors: draft.pageErrors.slice(-PAGE_ERRORS_MAX).map((error) => `${time(error.at)} ${error.message}`.slice(0, PAGE_ERROR_MAX)),
    viewport: draft.viewport,
  };
}

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
  /** Calls this server made to each work tool in the last 10 minutes; agents' own calls are not in it. */
  toolCalls: Array<{
    tool: string;
    calls: number;
    rateLimited: number;
    /** Not made, because the tool was rate limiting. */
    held: number;
    bySource: Array<{ source: string; calls: number }>;
    byName: Array<{ name: string; calls: number }>;
  }>;
};
