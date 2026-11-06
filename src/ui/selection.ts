/*
 * Selected and active states change color only, never font weight, border
 * width, or padding: a label that turns bold gets wider, so the row or the
 * labels next to it shift every time you click.
 */

/**
 * ### SELECTED_NAV
 *
 * The chosen item of a menu or a pill-style filter, such as the Settings
 * menu or the Insights range.
 */
export const SELECTED_NAV = "bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100";

/**
 * ### UNSELECTED_NAV
 *
 * The other items next to {@link SELECTED_NAV}.
 */
export const UNSELECTED_NAV =
  "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100";

/**
 * ### SELECTED_SEGMENT
 *
 * The chosen option of a `SegmentedControl` drawn on a sunken track:
 * it reads as raised above the track.
 */
export const SELECTED_SEGMENT = "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100";

/**
 * ### UNSELECTED_SEGMENT
 *
 * The other options next to {@link SELECTED_SEGMENT}.
 */
export const UNSELECTED_SEGMENT = "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100";

/**
 * ### SELECTED_ROW
 *
 * The open or keyboard-highlighted row of a sidebar list or the command
 * palette. Teal, so it stays apart from the gray hover of {@link ROW_HOVER}.
 * Muted text inside it steps up a shade, since zinc-500 on the teal falls
 * under 4.5:1 in dark mode.
 */
export const SELECTED_ROW = "bg-teal-100/70 dark:bg-teal-900/40 [&_.text-zinc-500]:text-zinc-600 dark:[&_.text-zinc-500]:text-zinc-300";

/**
 * ### ROW_HOVER
 *
 * The hover of a row that is not {@link SELECTED_ROW}.
 */
export const ROW_HOVER = "hover:bg-zinc-200/60 dark:hover:bg-zinc-800/70";
