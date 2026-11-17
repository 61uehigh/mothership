"use client";

import { useSyncExternalStore } from "react";
import type { Track } from "@/features/youtube-music/model/YouTubeMusic";
import { isUnplayableError, playerErrorMessage, REFUSED_IN_A_ROW, REFUSED_MESSAGE, RESTART_AFTER_SECONDS, stepIndex } from "@/features/youtube-music/model/queue";

/**
 * ### PlayerStatus
 *
 * What the player is doing: nothing queued, starting a song, playing, paused,
 * or at the end of the queue.
 */
export type PlayerStatus = "idle" | "loading" | "playing" | "paused" | "ended";

/**
 * ### PlayerState
 *
 * The queue and what is playing, shared by the section and the mini player.
 */
export type PlayerState = {
  queue: ReadonlyArray<Track>;
  /** Index into `queue` of the current song; meaningless while `queue` is empty. */
  index: number;
  status: PlayerStatus;
  /** Where the queue came from, e.g. a playlist's name. */
  source: string | undefined;
  /** Why the current song did not play, until another one starts. */
  error: string | undefined;
  /** Songs the embedded player refused; they are skipped and offered on music.youtube.com. */
  unplayable: ReadonlySet<string>;
};

/**
 * ### PlayerController
 *
 * What the mini player's IFrame player does for the store. Attached once the
 * player is ready; until then the store only records what to play.
 */
export type PlayerController = {
  load: (videoId: string) => void;
  play: () => void;
  pause: () => void;
  restart: () => void;
  /** Seconds into the current song. */
  currentTime: () => number;
};

const INITIAL: PlayerState = { queue: [], index: 0, status: "idle", source: undefined, error: undefined, unplayable: new Set() };

let state: PlayerState = INITIAL;
let controller: PlayerController | undefined;
/** Songs refused one after another since the last one that played; see {@link REFUSED_IN_A_ROW}. */
let refusedStreak: Array<string> = [];
const listeners = new Set<() => void>();

function set(patch: Partial<PlayerState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

function goTo(index: number): void {
  set({ index, status: "loading", error: undefined });
  controller?.load(state.queue[index].videoId);
}

/**
 * ### musicPlayer
 *
 * The one player queue in this window. Lives in the browser for the life of
 * the page, so music keeps playing as you move between tabs and sections.
 */
export const musicPlayer = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  snapshot(): PlayerState {
    return state;
  },
  /** The song playing (or about to), if any. */
  current(): Track | undefined {
    return state.queue[state.index];
  },
  /**
   * Plays `tracks` from `index`. Songs already known not to play here are
   * skipped.
   */
  playQueue(tracks: ReadonlyArray<Track>, index: number, source: string): void {
    if (tracks.length === 0) return;
    set({ queue: [...tracks], source });
    const start = state.unplayable.has(tracks[index]?.videoId ?? "") ? stepIndex(tracks, index, 1, state.unplayable) : index;
    goTo(start ?? index);
  },
  /** Pauses or resumes; starts the queue over once it has ended. */
  toggle(): void {
    if (state.queue.length === 0) return;
    if (state.status === "playing" || state.status === "loading") controller?.pause();
    else if (state.status === "ended") goTo(stepIndex(state.queue, -1, 1, state.unplayable) ?? 0);
    else controller?.play();
  },
  next(): void {
    const next = stepIndex(state.queue, state.index, 1, state.unplayable);
    if (next !== undefined) goTo(next);
  },
  /** Starts the song over when it is a few seconds in, else goes back one. */
  previous(): void {
    if (state.queue.length === 0) return;
    const previous = stepIndex(state.queue, state.index, -1, state.unplayable);
    if (previous === undefined || (controller?.currentTime() ?? 0) > RESTART_AFTER_SECONDS) controller?.restart();
    else goTo(previous);
  },
  /** Stops and clears the queue, which closes the mini player. */
  stop(): void {
    refusedStreak = [];
    set({ ...INITIAL, unplayable: state.unplayable });
  },
  /** Called by the mini player once its IFrame player is ready. */
  attach(next: PlayerController): () => void {
    controller = next;
    const track = musicPlayer.current();
    if (track !== undefined) next.load(track.videoId);
    return () => {
      if (controller === next) controller = undefined;
    };
  },
  /** Called by the mini player as the IFrame player changes state. */
  report(status: "playing" | "paused" | "ended"): void {
    if (status === "playing") refusedStreak = [];
    if (status !== "ended") return set({ status });
    const next = stepIndex(state.queue, state.index, 1, state.unplayable);
    if (next === undefined) set({ status: "ended" });
    else goTo(next);
  },
  /** Called by the mini player when the IFrame player fails; songs that can never play here are skipped. */
  reportError(code: number): void {
    const track = musicPlayer.current();
    const error = playerErrorMessage(code);
    if (track === undefined || !isUnplayableError(code)) return set({ status: "paused", error });
    refusedStreak.push(track.videoId);
    if (refusedStreak.length >= REFUSED_IN_A_ROW) {
      // Not these songs' fault: forget the marks this run of failures added, and stop.
      const unplayable = new Set(state.unplayable);
      for (const id of refusedStreak) unplayable.delete(id);
      refusedStreak = [];
      return set({ unplayable, status: "paused", error: REFUSED_MESSAGE });
    }
    const unplayable = new Set(state.unplayable).add(track.videoId);
    set({ unplayable, error });
    const next = stepIndex(state.queue, state.index, 1, unplayable);
    // Keep the message on the skipped song when nothing is left to play.
    if (next === undefined) set({ status: "ended" });
    else {
      goTo(next);
      set({ error: `Skipped “${track.title}”: ${error}` });
    }
  },
};

/**
 * ### usePlayer
 *
 * @returns The player's state, re-rendering when it changes.
 */
export function usePlayer(): PlayerState {
  return useSyncExternalStore(musicPlayer.subscribe, musicPlayer.snapshot, () => INITIAL);
}
