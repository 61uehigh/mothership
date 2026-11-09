/*
 * Row actions that appear on hover. The row carries the `group` class.
 *
 * They show on hover or keyboard focus (`:focus-visible`), not on any focus:
 * with `focus-within` the actions of a row you clicked stayed open after the
 * pointer left it. A row that swaps content in place, such as a to-do's date
 * for its buttons, gets a fixed height (`h-7`) so the taller buttons cannot
 * grow it; actions laid over the row are absolutely positioned instead.
 *
 * A control that opens a popup, such as a date picker, marks itself with
 * {@link KEEP_REVEALED} and holds focus while the popup is open: the row then
 * stays revealed as the pointer moves off it onto the popup, since hiding the
 * control (`display: none`) would close the popup.
 */

/**
 * ### KEEP_REVEALED
 *
 * Attribute for a control whose focus keeps its row's actions revealed.
 */
export const KEEP_REVEALED = { "data-keep-revealed": "" } as const;

/**
 * ### REVEAL_ON_HOVER
 *
 * Hidden until its `group` row is hovered, holds keyboard focus, or holds
 * focus in a {@link KEEP_REVEALED} control; then a flex box.
 */
export const REVEAL_ON_HOVER = "hidden group-hover:flex group-has-[:focus-visible]:flex group-has-[[data-keep-revealed]:focus]:flex";

/**
 * ### HIDE_ON_HOVER
 *
 * The content {@link REVEAL_ON_HOVER} replaces in place, such as a date.
 */
export const HIDE_ON_HOVER = "group-hover:hidden group-has-[:focus-visible]:hidden group-has-[[data-keep-revealed]:focus]:hidden";
