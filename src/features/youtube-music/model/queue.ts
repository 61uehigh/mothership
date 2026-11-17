import type { Track } from "@/features/youtube-music/model/YouTubeMusic";

/**
 * ### stepIndex
 *
 * The next (or previous) song in the queue that is not known to be
 * unplayable here.
 *
 * @param direction - `1` for next, `-1` for previous.
 * @param unplayable - Video ids the embedded player refused.
 * @returns Its index, or `undefined` at the end (or start) of the queue.
 */
export function stepIndex(queue: ReadonlyArray<Track>, index: number, direction: 1 | -1, unplayable: ReadonlySet<string>): number | undefined {
  for (let i = index + direction; i >= 0 && i < queue.length; i += direction) {
    if (!unplayable.has(queue[i].videoId)) return i;
  }
  return undefined;
}

/**
 * ### RESTART_AFTER_SECONDS
 *
 * Past this far into a song, "previous" starts it over instead, as music players do.
 */
export const RESTART_AFTER_SECONDS = 3;

/**
 * ### isUnplayableError
 *
 * @returns Whether the error means this song will never play here (so it is
 *   skipped and offered on music.youtube.com instead) rather than a passing failure.
 */
export function isUnplayableError(code: number): boolean {
  return code === 100 || code === 101 || code === 150;
}

/**
 * ### REFUSED_IN_A_ROW
 *
 * After this many songs in a row fail as unplayable, the player itself is
 * being refused (YouTube asking a signed-out player to prove it is not a
 * bot, say), not the songs: skipping stops instead of running through the queue.
 */
export const REFUSED_IN_A_ROW = 3;
