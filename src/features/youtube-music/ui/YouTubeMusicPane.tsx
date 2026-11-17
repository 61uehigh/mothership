"use client";

import type { YouTubeMusicErrorCode } from "@/lib/apiErrorCodes";
import { SetUpNotice } from "@/shell/SetUpNotice";
import { ChevronRight, ExternalLink, ListMusic, Pause, Play, Search, SkipBack, SkipForward, X } from "lucide-react";
import { useContext, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { formatDuration, LIKED_PLAYLIST_ID, musicUrl, playlistUrl, type ConnectionStatus, type Playlist, type Track, YOUTUBE_SEARCH_MAX } from "@/features/youtube-music/model/YouTubeMusic";
import { musicPlayer, usePlayer, type PlayerState } from "@/features/youtube-music/ui/playerStore";
import { youtubeFailureText } from "@/features/youtube-music/ui/youtubeFailureText";
import { PaneHeader, StackedSectionContext } from "@/shell/PaneHeader";
import { IconButton, RefreshButton, ROW_ACTION } from "@/ui/iconButtons";
import { Message } from "@/ui/Message";
import { useJson } from "@/ui/useJson";
import { openSettingsPage } from "@/shell/settingsPage";
import { useWorkbenchActions } from "@/shell/workbenchContext";
import { REVEAL_ON_HOVER } from "@/ui/hoverReveal";
import { ROW_HOVER } from "@/ui/selection";
import { useT } from "@/ui/i18n/useT";

/**
 * ### YouTubeMusicPane
 *
 * The YouTube Music section: your liked songs and playlists (open one to see
 * its songs), and search. Clicking a song plays the list from there in the
 * mini player, which keeps playing as you work. Until you sign in it links
 * to Settings → Connections, where the sign-in is; your library comes from
 * the YouTube Data API, so it has your playlists and likes but not YouTube
 * Music's history or saved albums.
 */
export function YouTubeMusicPane() {
  const t = useT();
  const folded = useContext(StackedSectionContext)?.collapsed === true;
  const workbench = useWorkbenchActions();
  const status = useJson<ConnectionStatus, YouTubeMusicErrorCode>(folded ? undefined : "/api/youtube-music/status");
  const connected = status.data?.state === "connected";
  // You sign in from Settings, in your browser; coming back to the app picks it up.
  const { reload: reloadStatus } = status;
  useEffect(() => {
    if (connected) return;
    window.addEventListener("focus", reloadStatus);
    return () => window.removeEventListener("focus", reloadStatus);
  }, [connected, reloadStatus]);

  const playlists = useJson<{ playlists: Array<Playlist>; note?: "no-channel" }, YouTubeMusicErrorCode>(connected && !folded ? "/api/youtube-music/playlists" : undefined);
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState<string | undefined>(undefined);

  function openConnections() {
    openSettingsPage("connections", () => workbench.open({ kind: "settings" }), "youtube_music");
  }

  function onSearch(event: FormEvent) {
    event.preventDefault();
    const text = query.trim();
    setSearched(text === "" ? undefined : text);
  }

  let body: ReactNode;
  // A library call that finds the sign-in gone or expired says more than the last status check.
  const libraryCode = playlists.failure?.code;
  const state = libraryCode === "expired" || libraryCode === "disconnected" || libraryCode === "unconfigured" ? libraryCode : status.data?.state;
  if (status.failure !== undefined && status.data === undefined) {
    body = <Message tone="error" onRetry={status.reload}>{youtubeFailureText(t, status.failure)}</Message>;
  } else if (status.data === undefined) {
    body = <Message>{t("youtubeMusic.checking")}</Message>;
  } else if (state === "unconfigured" || state === "disconnected" || state === "expired") {
    body = (
      <SetUpNotice
        title={t(state === "expired" ? "tools.signInExpired" : "tools.notConnected")}
        action={t(state === "expired" ? "tools.signInAgain" : "tools.setUpInSettings")}
        onAction={openConnections}
      >
        {t(state === "expired" ? "youtubeMusic.expired" : "youtubeMusic.setUp")}
      </SetUpNotice>
    );
  } else {
    body = (
      <>
        <form onSubmit={onSearch} className="mx-2 mb-2 flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 dark:border-zinc-800 dark:bg-zinc-900">
          <Search size={13} className="shrink-0 text-zinc-400" aria-hidden />
          <input
            className="min-w-0 flex-1 bg-transparent py-1 text-[13px] outline-none placeholder:text-zinc-400"
            value={query}
            maxLength={YOUTUBE_SEARCH_MAX}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("youtubeMusic.searchPlaceholder")}
            aria-label={t("youtubeMusic.searchLabel")}
          />
          {searched !== undefined && (
            <IconButton
              label={t("youtubeMusic.clearSearch")}
              className={ROW_ACTION}
              onClick={() => {
                setQuery("");
                setSearched(undefined);
              }}
            >
              <X size={12} />
            </IconButton>
          )}
        </form>
        <NowPlaying />
        {searched !== undefined ? (
          <SearchResults query={searched} />
        ) : playlists.failure !== undefined && playlists.data === undefined ? (
          <>
            <Message tone={playlists.failure.code === "quota" ? "muted" : "error"} onRetry={playlists.reload}>
              {youtubeFailureText(t, playlists.failure)}
            </Message>
            {playlists.failure.code === "api-disabled" && (
              <button type="button" onClick={openConnections} className="mx-2 text-xs text-teal-700 underline dark:text-teal-400">
                {t("tools.fixInSettings")}
              </button>
            )}
          </>
        ) : playlists.data === undefined ? (
          <Message>{t("youtubeMusic.loadingPlaylists")}</Message>
        ) : (
          <>
            <ul>
              {playlists.data.playlists.map((playlist) => (
                <PlaylistRow key={playlist.id} playlist={playlist} />
              ))}
            </ul>
            {playlists.data.note !== undefined && (
              <div className="px-2 py-2 text-[11px] text-zinc-500">
                <p>{t("youtubeMusic.noChannel")}</p>
                <button type="button" onClick={openConnections} className="mt-1 text-teal-700 underline dark:text-teal-400">
                  {t("tools.signInAgain")}
                </button>
              </div>
            )}
          </>
        )}
      </>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PaneHeader title={t("section.youtubemusic")}>
        <RefreshButton
          label={t("youtubeMusic.refresh")}
          loading={status.loading || playlists.loading}
          onClick={() => {
            status.reload();
            playlists.reload();
          }}
        />
      </PaneHeader>
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-3">{body}</div>
    </div>
  );
}

/** The song playing, with controls; shown above the lists while a queue is playing. */
function NowPlaying() {
  const t = useT();
  const player = usePlayer();
  const track = player.queue[player.index];
  if (track === undefined) return null;
  const playing = player.status === "playing" || player.status === "loading";
  return (
    <div className="mx-2 mb-2 flex items-center gap-1 rounded-md bg-red-50 px-2 py-1 dark:bg-red-950/40">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-medium">{track.title}</span>
        <span className="block truncate text-[11px] text-zinc-500">{track.artist ?? player.source}</span>
      </span>
      <IconButton label={t("youtubeMusic.previous")} className={ROW_ACTION} onClick={() => musicPlayer.previous()}>
        <SkipBack size={12} />
      </IconButton>
      <IconButton label={t(playing ? "youtubeMusic.pause" : "youtubeMusic.play")} className={ROW_ACTION} onClick={() => musicPlayer.toggle()}>
        {playing ? <Pause size={12} /> : <Play size={12} />}
      </IconButton>
      <IconButton label={t("youtubeMusic.next")} className={ROW_ACTION} onClick={() => musicPlayer.next()}>
        <SkipForward size={12} />
      </IconButton>
    </div>
  );
}

function PlaylistRow({ playlist }: { playlist: Playlist }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const tracks = useJson<{ tracks: Array<Track> }, YouTubeMusicErrorCode>(open ? `/api/youtube-music/playlists/${encodeURIComponent(playlist.id)}` : undefined);
  const player = usePlayer();
  const sourceId = `playlist:${playlist.id}`;
  const playingHere = player.sourceId === sourceId && player.queue.length > 0;
  const title = playlist.id === LIKED_PLAYLIST_ID ? t("youtubeMusic.liked") : playlist.title;

  return (
    <li>
      <div className="group relative">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left ${ROW_HOVER}`}
        >
          <ChevronRight size={12} className={`shrink-0 text-zinc-400 transition-transform ${open ? "rotate-90" : ""}`} aria-hidden />
          <Cover src={playlist.thumbnail} liked={playlist.id === LIKED_PLAYLIST_ID} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className={`truncate text-[13px] ${playingHere ? "text-red-700 dark:text-red-400" : ""}`}>{title}</span>
            {playlist.count !== undefined && <span className="text-[11px] text-zinc-500">{t("youtubeMusic.songs", { count: playlist.count })}</span>}
          </span>
        </button>
        <span className={`absolute right-1 top-1/2 -translate-y-1/2 gap-0.5 rounded bg-zinc-100 dark:bg-zinc-900 ${REVEAL_ON_HOVER}`}>
          <a className={ROW_ACTION} href={playlistUrl(playlist.id)} target="_blank" rel="noreferrer" title={t("youtubeMusic.openIn")} aria-label={t("youtubeMusic.openIn")}>
            <ExternalLink size={12} />
          </a>
        </span>
      </div>
      {open &&
        (tracks.failure !== undefined && tracks.data === undefined ? (
          <Message tone="error" onRetry={tracks.reload}>
            {youtubeFailureText(t, tracks.failure)}
          </Message>
        ) : tracks.data === undefined ? (
          <Message>{t("youtubeMusic.loadingSongs")}</Message>
        ) : tracks.data.tracks.length === 0 ? (
          <Message>{t(playlist.id === LIKED_PLAYLIST_ID ? "youtubeMusic.noLikedSongs" : "youtubeMusic.noSongs")}</Message>
        ) : (
          <TrackList tracks={tracks.data.tracks} source={title} sourceId={sourceId} player={player} indent />
        ))}
    </li>
  );
}

function SearchResults({ query }: { query: string }) {
  const t = useT();
  const results = useJson<{ tracks: Array<Track> }, YouTubeMusicErrorCode>(`/api/youtube-music/search?q=${encodeURIComponent(query)}`);
  const player = usePlayer();
  if (results.failure !== undefined && results.data === undefined) {
    return (
      <Message tone={results.failure.code === "quota" ? "muted" : "error"} onRetry={results.reload}>
        {youtubeFailureText(t, results.failure)}
      </Message>
    );
  }
  if (results.data === undefined) return <Message>{t("youtubeMusic.searching")}</Message>;
  if (results.data.tracks.length === 0) return <Message>{t("youtubeMusic.noResults", { query })}</Message>;
  return (
    <>
      <h4 className="px-2 py-1 text-[11px] font-medium text-zinc-500">{t("youtubeMusic.results", { query })}</h4>
      <TrackList tracks={results.data.tracks} source={t("youtubeMusic.searchSource", { query })} sourceId={`search:${query}`} player={player} />
    </>
  );
}

function TrackList({ tracks, source, sourceId, player, indent = false }: { tracks: Array<Track>; source: string; sourceId: string; player: PlayerState; indent?: boolean }) {
  const t = useT();
  const current = player.sourceId === sourceId ? player.queue[player.index]?.videoId : undefined;
  return (
    <ul className={indent ? "mb-1 ml-4 border-l border-zinc-200 pl-1 dark:border-zinc-800" : undefined}>
      {indent && (
        <li>
          <button
            type="button"
            className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-[12px] text-red-700 hover:bg-zinc-200/60 dark:text-red-400 dark:hover:bg-zinc-800/70"
            onClick={() => musicPlayer.playQueue(tracks, 0, source, sourceId)}
          >
            <ListMusic size={12} aria-hidden />
            {t("youtubeMusic.playAll")}
          </button>
        </li>
      )}
      {tracks.map((track, index) => {
        const unplayable = player.unplayable.has(track.videoId);
        const isCurrent = track.videoId === current;
        return (
          <li key={`${track.videoId}:${index}`} className="group relative">
            <button
              type="button"
              title={unplayable ? t("youtubeMusic.onlyOnSite") : `${track.title}${track.artist === undefined ? "" : ` · ${track.artist}`}`}
              onClick={() => (unplayable ? window.open(musicUrl(track.videoId), "_blank", "noreferrer") : musicPlayer.playQueue(tracks, index, source, sourceId))}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left ${
                isCurrent ? "bg-red-100/70 dark:bg-red-950/50" : ROW_HOVER
              } ${unplayable ? "opacity-50" : ""}`}
            >
              <Cover src={track.thumbnail} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[12px]">{track.title}</span>
                {track.artist !== undefined && <span className="truncate text-[11px] text-zinc-500">{track.artist}</span>}
              </span>
              {unplayable ? (
                <ExternalLink size={11} className="shrink-0 text-zinc-400" aria-label={t("youtubeMusic.opensOnSite")} />
              ) : (
                track.durationSeconds !== undefined && <span className="shrink-0 text-[10px] tabular-nums text-zinc-500">{formatDuration(track.durationSeconds)}</span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Cover({ src, liked = false }: { src: string | undefined; liked?: boolean }) {
  if (src === undefined) {
    return (
      <span className={`flex size-7 shrink-0 items-center justify-center rounded ${liked ? "bg-gradient-to-br from-red-500 to-pink-500 text-white" : "bg-zinc-200 text-zinc-500 dark:bg-zinc-800"}`}>
        <ListMusic size={13} aria-hidden />
      </span>
    );
  }
  // Covers come from YouTube's image servers, at the size YouTube already serves.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-7 shrink-0 rounded object-cover" />;
}
