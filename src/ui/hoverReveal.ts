/*
 * Row actions that appear on hover. The row carries the `group` class.
 *
 * They show on hover or keyboard focus (`:focus-visible`), not on any focus:
 * with `focus-within` the actions of a row you clicked stayed open after the
 * pointer left it. A row that swaps content in place, such as a to-do's date
 * for its buttons, gets a fixed height (`h-7`) so the taller buttons cannot
 * grow it; actions laid over the row are absolutely positioned instead.
 */

/**
 * ### REVEAL_ON_HOVER
 *
 * Hidden until its `group` row is hovered or holds keyboard focus; then a
 * flex box.
 */
export const REVEAL_ON_HOVER = "hidden group-hover:flex group-has-[:focus-visible]:flex";

/**
 * ### HIDE_ON_HOVER
 *
 * The content {@link REVEAL_ON_HOVER} replaces in place, such as a date.
 */
export const HIDE_ON_HOVER = "group-hover:hidden group-has-[:focus-visible]:hidden";
