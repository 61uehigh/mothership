import type { GoogleClientProblem, GoogleOAuthSignInFailure, YouTubeMusicErrorCode } from "@/lib/apiErrorCodes";

/**
 * ### YOUTUBE_SEARCH_MAX
 *
 * Longest search query, in characters.
 */
export const YOUTUBE_SEARCH_MAX = 200;

/**
 * ### LIKED_PLAYLIST_ID
 *
 * The id the section uses for your liked songs, which YouTube keeps as a
 * rating rather than as a playlist you can list.
 */
export const LIKED_PLAYLIST_ID = "liked";

/**
 * ### LIKED_PLAYLIST
 *
 * Your liked songs as the first entry of the playlist list.
 */
export const LIKED_PLAYLIST: Playlist = { id: LIKED_PLAYLIST_ID, title: "", count: undefined, thumbnail: undefined };

/**
 * ### Track
 *
 * One song: a YouTube video, as the section lists and plays it.
 */
export type Track = {
  videoId: string;
  title: string;
  /** The channel, without the " - Topic" YouTube adds to artist channels; `undefined` when unknown. */
  artist: string | undefined;
  /** Length in whole seconds; `undefined` when the list did not include it. */
  durationSeconds: number | undefined;
  /** A small cover image URL. */
  thumbnail: string | undefined;
};

/**
 * ### Playlist
 *
 * One of your YouTube (and so YouTube Music) playlists, or your liked songs.
 */
export type Playlist = {
  /** A YouTube playlist id, or {@link LIKED_PLAYLIST_ID}. */
  id: string;
  /** YouTube's title; empty for liked songs, which the UI names in the chosen language. */
  title: string;
  /** How many videos YouTube says it holds; `undefined` for liked songs. */
  count: number | undefined;
  thumbnail: string | undefined;
};

/**
 * ### ConnectionStatus
 *
 * Whether the section can read your library.
 * - `unconfigured`: no usable OAuth client of YouTube Music's own; `reason` says why.
 * - `disconnected`: the client is set but you have not signed in with it.
 * - `expired`: Google no longer accepts the sign-in (test-mode clients expire weekly).
 * - `connected`: ready.
 */
export type ConnectionStatus = {
  state: "unconfigured" | "disconnected" | "expired" | "connected";
  /** Why there is no usable client; only while `unconfigured`. */
  reason: GoogleClientProblem | undefined;
  /** A client file is saved (it may still be broken, see `reason`). */
  clientSaved: boolean;
  /** The client's Google Cloud project, for links into it. */
  projectId: string | undefined;
  /** Your YouTube channel's name, once signed in and read. */
  account: string | undefined;
  /** The signed-in Google account's email address. */
  email: string | undefined;
  /** Why the last sign-in came back without being kept. */
  signInError: GoogleOAuthSignInFailure | undefined;
  /** How many sign-ins this server started have ended, so a card tells the one it just began from an earlier one. */
  signInsEnded: number;
};

/**
 * ### NO_CHANNEL_MESSAGE
 *
 * What a sign-in to a Google account without a YouTube channel means.
 */
export const NO_CHANNEL_MESSAGE =
  "The Google account you signed in with has no YouTube channel, so YouTube lists no playlists for it. If your YouTube Music is on another Google account, sign in again and choose that one";

/**
 * ### YouTubeMusicTest
 *
 * Result of Settings' "Test connection": your channel and how many playlists
 * (liked songs included) the section can list, or the raw error.
 */
export type YouTubeMusicTest = { ok: true; who: string | undefined; items: number } | { ok: false; message: string; code: YouTubeMusicErrorCode | undefined };

/**
 * ### apiLibraryUrl
 *
 * @returns The YouTube Data API v3 page in Google Cloud, in `projectId` when known.
 */
export function apiLibraryUrl(projectId: string | undefined): string {
  return `https://console.cloud.google.com/apis/library/youtube.googleapis.com${projectId === undefined ? "" : `?project=${encodeURIComponent(projectId)}`}`;
}

/**
 * ### cleanArtist
 *
 * YouTube Music's auto-generated artist channels are named "Artist - Topic";
 * the section shows just the artist.
 *
 * @returns The channel name without the suffix, or `undefined` for an empty name.
 */
export function cleanArtist(channelTitle: string | null | undefined): string | undefined {
  const name = (channelTitle ?? "").replace(/\s+-\s+Topic$/, "").trim();
  return name === "" ? undefined : name;
}

/**
 * ### parseIsoDuration
 *
 * Reads the ISO 8601 durations the Data API uses, e.g. `PT3M25S` or `PT1H2M`.
 *
 * @returns Whole seconds, or `undefined` for anything else (live streams answer `P0D`, which is 0).
 */
export function parseIsoDuration(value: string | null | undefined): number | undefined {
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value ?? "");
  if (match === null || value === "P" || value === "PT") return undefined;
  const [days, hours, minutes, seconds] = match.slice(1).map((part) => Number(part ?? 0));
  return ((days * 24 + hours) * 60 + minutes) * 60 + seconds;
}

/**
 * ### formatDuration
 *
 * @returns `m:ss`, or `h:mm:ss` from an hour up; `""` for `undefined`.
 */
export function formatDuration(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return "";
  const whole = Math.floor(seconds);
  const s = String(whole % 60).padStart(2, "0");
  const m = Math.floor(whole / 60) % 60;
  const h = Math.floor(whole / 3600);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/**
 * ### musicUrl
 *
 * @returns The song on music.youtube.com, for songs the embedded player may not play.
 */
export function musicUrl(videoId: string): string {
  return `https://music.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

/**
 * ### playlistUrl
 *
 * @returns The playlist (or your liked songs) on music.youtube.com.
 */
export function playlistUrl(playlistId: string): string {
  return playlistId === LIKED_PLAYLIST_ID
    ? "https://music.youtube.com/playlist?list=LM"
    : `https://music.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`;
}
