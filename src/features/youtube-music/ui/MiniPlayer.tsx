"use client";

import { ExternalLink, Pause, Play, SkipBack, SkipForward, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCommands, type Command } from "@/shell/commands/commandContext";
import { formatDuration, musicUrl } from "@/features/youtube-music/model/YouTubeMusic";
import { musicPlayer, usePlayer, type PlayerError } from "@/features/youtube-music/ui/playerStore";
import { ICON_BUTTON } from "@/ui/iconButtons";
import type { Translate } from "@/ui/i18n/translate";
import { useT } from "@/ui/i18n/useT";

/** The parts of the YouTube IFrame Player API this file uses. */
type YTPlayer = {
  loadVideoById: (videoId: string) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  destroy: () => void;
};

type YTNamespace = {
  Player: new (
    element: HTMLElement,
    options: {
      width: number;
      height: number;
      playerVars: Record<string, string | number>;
      events: {
        onReady: () => void;
        onStateChange: (event: { data: number }) => void;
        onError: (event: { data: number }) => void;
      };
    },
  ) => YTPlayer;
};

// Widening only: the IFrame API puts these on `window`.
const ytWindow = (): Window & { YT?: Partial<YTNamespace>; onYouTubeIframeAPIReady?: () => void } => window;

/** The IFrame API's player states this file reacts to. */
const ENDED = 0;
const PLAYING = 1;
const PAUSED = 2;

let apiLoading: Promise<YTNamespace> | undefined;

/** Loads YouTube's IFrame API script once per page. */
function loadIframeApi(): Promise<YTNamespace> {
  apiLoading ??= new Promise<YTNamespace>((resolve, reject) => {
    const w = ytWindow();
    if (w.YT?.Player !== undefined) return resolve(w.YT as YTNamespace);
    const previous = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(ytWindow().YT as YTNamespace);
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => {
      apiLoading = undefined;
      reject(new Error("Could not load the YouTube player"));
    };
    document.head.append(script);
  });
  return apiLoading;
}

const CONTROL = `${ICON_BUTTON} text-zinc-600 dark:text-zinc-300`;

/** The IFrame player's `onError` codes in words. */
function codeText(t: Translate, code: number): string {
  switch (code) {
    case 2:
      return t("youtubeMusic.error.badId");
    case 5:
      return t("youtubeMusic.error.cannotPlay");
    case 100:
      return t("youtubeMusic.error.removed");
    case 101:
    case 150:
      return t("youtubeMusic.error.notEmbeddable");
    case 153:
      return t("youtubeMusic.error.unknownPage");
    default:
      return t("youtubeMusic.error.other", { code });
  }
}

/** Why the song did not play, as the mini player shows it. */
function errorText(t: Translate, error: PlayerError): string {
  if (error.kind === "refused") return t("youtubeMusic.error.refused");
  const text = codeText(t, error.code);
  return error.skipped === undefined ? text : t("youtubeMusic.error.skipped", { title: error.skipped, error: text });
}

/**
 * ### MiniPlayer
 *
 * YouTube Music's player: a small card in the corner of the window while a
 * queue is playing, with the video, the song, and its controls. It is
 * mounted once by the workbench, so music keeps playing whichever tab or
 * section is open; it disappears (and stops) when you close it. Also adds
 * play/pause, next, previous, and stop to the command palette.
 */
export function MiniPlayer() {
  const t = useT();
  const player = usePlayer();
  const track = player.queue[player.index];
  const active = player.queue.length > 0;

  const commands = useMemo<Array<Command>>(
    () =>
      active
        ? [
            { id: "youtubemusic.toggle", title: t("youtubeMusic.command.toggle"), group: "YouTube Music", keys: [], run: () => musicPlayer.toggle() },
            { id: "youtubemusic.next", title: t("youtubeMusic.command.next"), group: "YouTube Music", keys: [], run: () => musicPlayer.next() },
            { id: "youtubemusic.previous", title: t("youtubeMusic.command.previous"), group: "YouTube Music", keys: [], run: () => musicPlayer.previous() },
            { id: "youtubemusic.stop", title: t("youtubeMusic.command.stop"), group: "YouTube Music", keys: [], run: () => musicPlayer.stop() },
          ]
        : [],
    [active, t],
  );
  useCommands(commands);

  if (!active || track === undefined) return null;
  return (
    <div
      role="region"
      aria-label={t("youtubeMusic.player")}
      className="fixed bottom-8 right-3 z-40 flex w-[22rem] max-w-[calc(100vw-1.5rem)] gap-2 rounded-lg border border-zinc-200 bg-white/95 p-2 shadow-lg backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95"
    >
      <VideoFrame />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start gap-1">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium" title={track.title}>
              {track.title}
            </p>
            <p className="truncate text-[11px] text-zinc-500">{[track.artist, player.source].filter(Boolean).join(" · ") || " "}</p>
          </div>
          <a className={CONTROL} href={musicUrl(track.videoId)} target="_blank" rel="noreferrer" title={t("youtubeMusic.openIn")} aria-label={t("youtubeMusic.openIn")}>
            <ExternalLink size={13} />
          </a>
          <button type="button" className={CONTROL} title={t("youtubeMusic.stopAndClose")} aria-label={t("youtubeMusic.stopAndClose")} onClick={() => musicPlayer.stop()}>
            <X size={13} />
          </button>
        </div>
        {player.error !== undefined && (
          <p className="truncate text-[11px] text-amber-700 dark:text-amber-400" title={errorText(t, player.error)}>
            {errorText(t, player.error)}
          </p>
        )}
        <div className="mt-auto flex items-center gap-0.5">
          <button type="button" className={CONTROL} title={t("youtubeMusic.previous")} aria-label={t("youtubeMusic.previous")} onClick={() => musicPlayer.previous()}>
            <SkipBack size={14} />
          </button>
          <button
            type="button"
            className={CONTROL}
            title={t(player.status === "playing" || player.status === "loading" ? "youtubeMusic.pause" : "youtubeMusic.play")}
            aria-label={t(player.status === "playing" || player.status === "loading" ? "youtubeMusic.pause" : "youtubeMusic.play")}
            onClick={() => musicPlayer.toggle()}
          >
            {player.status === "playing" || player.status === "loading" ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button type="button" className={CONTROL} title={t("youtubeMusic.next")} aria-label={t("youtubeMusic.next")} onClick={() => musicPlayer.next()}>
            <SkipForward size={14} />
          </button>
          <span className="ml-auto text-[10px] tabular-nums text-zinc-500">
            {player.index + 1}/{player.queue.length}
          </span>
        </div>
        <Progress />
      </div>
    </div>
  );
}

/** Seconds into the song and its length, read from the player while it is attached. */
const position: { read: () => { at: number; length: number }; seek: (seconds: number) => void } = { read: () => ({ at: 0, length: 0 }), seek: () => {} };

/**
 * The IFrame player. YouTube replaces the element it is given with its own
 * iframe, so that element is made here rather than by React.
 */
function VideoFrame() {
  const t = useT();
  const host = useRef<HTMLDivElement>(null);
  // Set when the IFrame API script does not load or the player cannot be made.
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const wrapper = host.current;
    if (wrapper === null) return;
    let cancelled = false;
    let player: YTPlayer | undefined;
    let detach: (() => void) | undefined;
    const target = document.createElement("div");
    wrapper.append(target);
    loadIframeApi()
      .then((YT) => {
        if (cancelled) return;
        player = new YT.Player(target, {
          width: 128,
          height: 72,
          // `origin` lets the player answer this page's API calls; YouTube also checks the page's referrer.
          playerVars: { autoplay: 1, playsinline: 1, rel: 0, enablejsapi: 1, origin: window.location.origin },
          events: {
            onReady: () => {
              if (cancelled || player === undefined) return;
              const ready = player;
              position.read = () => ({ at: ready.getCurrentTime(), length: ready.getDuration() });
              position.seek = (seconds) => ready.seekTo(seconds, true);
              detach = musicPlayer.attach({
                load: (videoId) => ready.loadVideoById(videoId),
                play: () => ready.playVideo(),
                pause: () => ready.pauseVideo(),
                restart: () => ready.seekTo(0, true),
                currentTime: () => ready.getCurrentTime(),
              });
            },
            onStateChange: ({ data }) => {
              if (data === PLAYING) musicPlayer.report("playing");
              else if (data === PAUSED) musicPlayer.report("paused");
              else if (data === ENDED) musicPlayer.report("ended");
            },
            onError: ({ data }) => musicPlayer.reportError(data),
          },
        });
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      detach?.();
      position.read = () => ({ at: 0, length: 0 });
      position.seek = () => {};
      player?.destroy();
      wrapper.replaceChildren();
    };
  }, []);

  return (
    <div className="relative h-[72px] w-32 shrink-0 overflow-hidden rounded bg-black">
      <div ref={host} className="size-full [&>iframe]:size-full" />
      {failed && <p className="absolute inset-0 p-1 text-[10px] text-zinc-300">{t("youtubeMusic.playerUnavailable")}</p>}
    </div>
  );
}

/** How far into the song, with a bar you can drag to seek. */
function Progress() {
  const t = useT();
  const [at, setAt] = useState({ at: 0, length: 0 });
  useEffect(() => {
    const timer = window.setInterval(() => setAt(position.read()), 500);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <div className="flex items-center gap-1.5 text-[10px] tabular-nums text-zinc-500">
      <span>{formatDuration(at.at)}</span>
      <input
        type="range"
        aria-label={t("youtubeMusic.position")}
        min={0}
        max={Math.max(1, Math.floor(at.length))}
        value={Math.min(Math.floor(at.at), Math.floor(at.length))}
        onChange={(event) => {
          const seconds = Number(event.target.value);
          position.seek(seconds);
          setAt((current) => ({ ...current, at: seconds }));
        }}
        className="h-1 min-w-0 flex-1 accent-red-600"
      />
      <span>{formatDuration(at.length)}</span>
    </div>
  );
}
