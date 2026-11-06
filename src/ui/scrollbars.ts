/**
 * ### CLASSIC_SCROLLBARS
 *
 * The class on `<html>` where scrollbars take up room (Windows, Linux).
 * globals.css then draws them thin and keeps their room in each pane, so a
 * pane never shifts sideways when its scrollbar comes and goes.
 */
export const CLASSIC_SCROLLBARS = "classic-scrollbars";

/**
 * ### SCROLLBARS_SCRIPT
 *
 * Runs before first paint: marks systems other than macOS and iOS, whose
 * overlay scrollbars take no room and are left as they are.
 */
export const SCROLLBARS_SCRIPT = `if(!/Mac|iPhone|iPad/.test(navigator.userAgent))document.documentElement.classList.add("${CLASSIC_SCROLLBARS}")`;
