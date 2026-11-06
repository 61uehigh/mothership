/**
 * ### SavedView
 *
 * A save's answer on screen: the `view` it returned, the fetched view it was
 * made over (`over`), and when it was asked (`asked`, from a counter).
 */
export type SavedView<V> = { view: V; over: V | undefined; asked: number };

/**
 * ### nextSaved
 *
 * What is on screen once a save (or a recheck) answers. Answers take seconds
 * (readiness checks) and can arrive out of order, so one asked before the
 * answer on screen is dropped: it would undo that newer change.
 *
 * @param asked - When the answering call was made, from the same counter as `shown.asked`.
 * @param answer - The view it returned; `undefined` when it failed.
 * @param over - The fetched view on screen when it was made.
 */
export function nextSaved<V>(shown: SavedView<V> | undefined, asked: number, answer: V | undefined, over: V | undefined): SavedView<V> | undefined {
  if (answer === undefined) return shown;
  if (shown !== undefined && shown.asked > asked) return shown;
  return { view: answer, over, asked };
}

/**
 * ### shownView
 *
 * The view to draw: a save's answer is newer than the fetched view it was
 * made over, until the fetch brings a view of its own (a reload, a change
 * made elsewhere).
 */
export function shownView<V>(saved: SavedView<V> | undefined, fetched: V | undefined): V | undefined {
  return saved !== undefined && saved.over === fetched ? saved.view : fetched;
}

/**
 * ### listWhileSaving
 *
 * A list that saves whole on every change: the list being saved shows at
 * once, and further changes wait (`locked`) until its save returns, since one
 * built from the list before it would drop it.
 *
 * @param saving - The list a save is sending; `undefined` when none is.
 * @param saved - The list as last saved.
 */
export function listWhileSaving<T>(saving: Array<T> | undefined, saved: Array<T>): { shown: Array<T>; locked: boolean } {
  return { shown: saving ?? saved, locked: saving !== undefined };
}
