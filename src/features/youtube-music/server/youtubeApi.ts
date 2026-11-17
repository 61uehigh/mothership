import { z } from "zod";
import { cleanArtist, LIKED_PLAYLIST, LIKED_PLAYLIST_ID, NO_CHANNEL_MESSAGE, parseIsoDuration, type Playlist, type Track } from "@/features/youtube-music/model/YouTubeMusic";
import { YouTubeMusicError } from "@/features/youtube-music/server/YouTubeMusicError";
import { unescapeHtml } from "@/lib/html";

const API = "https://www.googleapis.com/youtube/v3";
const TIMEOUT_MS = 15_000;
/** YouTube's "Music" video category: liked videos in it are your liked songs. */
const MUSIC_CATEGORY = "10";
/** The most a list request returns. */
const PAGE_SIZE = 50;
/** Pages followed for one list, so a long playlist stays a handful of quota units. */
const MAX_PAGES = 4;
/** Results of one search; a search costs 100 units of the 10,000 a day, however many it returns. */
const SEARCH_RESULTS = 20;

const thumbnailsSchema = z
  .object({ default: z.object({ url: z.string() }).optional(), medium: z.object({ url: z.string() }).optional() })
  .partial()
  .nullish();

type Thumbnails = z.infer<typeof thumbnailsSchema>;
const thumbnail = (thumbnails: Thumbnails): string | undefined => thumbnails?.medium?.url ?? thumbnails?.default?.url;

const pageSchema = <T extends z.ZodType>(item: T) => z.object({ items: z.array(item).default([]), nextPageToken: z.string().optional() });

const playlistSchema = z.object({
  id: z.string(),
  snippet: z.object({ title: z.string(), thumbnails: thumbnailsSchema }),
  contentDetails: z.object({ itemCount: z.number() }).partial().optional(),
});

const playlistItemSchema = z.object({
  snippet: z.object({
    title: z.string(),
    resourceId: z.object({ videoId: z.string().optional() }),
    videoOwnerChannelTitle: z.string().optional(),
    thumbnails: thumbnailsSchema,
  }),
});

const videoSchema = z.object({
  id: z.string(),
  snippet: z.object({ title: z.string(), channelTitle: z.string().optional(), categoryId: z.string().optional(), thumbnails: thumbnailsSchema }),
  contentDetails: z.object({ duration: z.string() }).partial().optional(),
});

const searchResultSchema = z.object({
  id: z.object({ videoId: z.string().optional() }),
  snippet: z.object({ title: z.string(), channelTitle: z.string().optional(), thumbnails: thumbnailsSchema }),
});

/**
 * ### parsePlaylists
 *
 * @param json - One page of `playlists.list` with `mine=true`.
 */
export function parsePlaylists(json: unknown): { playlists: Array<Playlist>; next: string | undefined } {
  const page = parse(pageSchema(playlistSchema), json, "playlists");
  return {
    playlists: page.items.map((p) => ({ id: p.id, title: p.snippet.title, count: p.contentDetails?.itemCount, thumbnail: thumbnail(p.snippet.thumbnails) })),
    next: page.nextPageToken,
  };
}

/**
 * ### parsePlaylistItems
 *
 * Deleted and private videos stay in a playlist as "Deleted video" /
 * "Private video" rows with no owner; they cannot play, so they are dropped.
 *
 * @param json - One page of `playlistItems.list`.
 */
export function parsePlaylistItems(json: unknown): { tracks: Array<Track>; next: string | undefined } {
  const page = parse(pageSchema(playlistItemSchema), json, "playlist items");
  return {
    tracks: page.items.flatMap(({ snippet }) =>
      snippet.resourceId.videoId === undefined || snippet.videoOwnerChannelTitle === undefined
        ? []
        : [{ videoId: snippet.resourceId.videoId, title: snippet.title, artist: cleanArtist(snippet.videoOwnerChannelTitle), durationSeconds: undefined, thumbnail: thumbnail(snippet.thumbnails) }],
    ),
    next: page.nextPageToken,
  };
}

/**
 * ### parseLikedSongs
 *
 * Your liked videos in the Music category, which is what YouTube Music shows
 * as liked songs (a liked song is a liked video).
 *
 * @param json - One page of `videos.list` with `myRating=like`.
 */
export function parseLikedSongs(json: unknown): { tracks: Array<Track>; next: string | undefined } {
  const page = parse(pageSchema(videoSchema), json, "liked videos");
  return {
    tracks: page.items
      .filter((v) => v.snippet.categoryId === MUSIC_CATEGORY)
      .map((v) => ({
        videoId: v.id,
        title: v.snippet.title,
        artist: cleanArtist(v.snippet.channelTitle),
        durationSeconds: parseIsoDuration(v.contentDetails?.duration),
        thumbnail: thumbnail(v.snippet.thumbnails),
      })),
    next: page.nextPageToken,
  };
}

/**
 * ### parseSearch
 *
 * @param json - `search.list` with `type=video`.
 */
export function parseSearch(json: unknown): Array<Track> {
  return parse(pageSchema(searchResultSchema), json, "search results").items.flatMap(({ id, snippet }) =>
    id.videoId === undefined
      ? []
      : [{ videoId: id.videoId, title: unescapeHtml(snippet.title), artist: cleanArtist(snippet.channelTitle && unescapeHtml(snippet.channelTitle)), durationSeconds: undefined, thumbnail: thumbnail(snippet.thumbnails) }],
  );
}

function parse<T>(schema: z.ZodType<T>, json: unknown, what: string): T {
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new YouTubeMusicError(`YouTube answered ${what} in an unexpected shape: ${z.prettifyError(parsed.error)}`, 502, "failed");
  return parsed.data;
}

const errorSchema = z.object({ error: z.object({ message: z.string(), errors: z.array(z.object({ reason: z.string() })).default([]) }) });

/**
 * ### youtubeGet
 *
 * One Data API read with your access token.
 *
 * @throws YouTubeMusicError With code `quota` when the day's quota is used
 *   up, `expired` when Google refuses the token, `unreachable` when YouTube
 *   cannot be reached, `failed` otherwise.
 */
export async function youtubeGet(token: string, resource: string, params: Record<string, string>): Promise<unknown> {
  const url = `${API}/${resource}?${new URLSearchParams(params)}`;
  let response: Response;
  try {
    response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    throw new YouTubeMusicError(timedOut ? "YouTube did not answer in time" : "Could not reach YouTube", timedOut ? 504 : 502, "unreachable");
  }
  const body: unknown = await response.json().catch(() => undefined);
  if (response.ok) return body;
  const error = errorSchema.safeParse(body);
  const reasons = error.success ? error.data.error.errors.map((e) => e.reason) : [];
  if (reasons.some((r) => r === "quotaExceeded" || r === "dailyLimitExceeded")) {
    throw new YouTubeMusicError("Today's YouTube Data API quota is used up; it resets at midnight Pacific time", 429, "quota");
  }
  const message = error.success ? error.data.error.message : `status ${response.status}`;
  if (response.status === 401) throw new YouTubeMusicError(`Google no longer accepts the YouTube sign-in: it expired or was revoked (${message})`, 401, "expired");
  // Google's own message names the project and links the API's page; Settings turns it into an Enable button.
  if (reasons.includes("accessNotConfigured") || reasons.includes("SERVICE_DISABLED")) throw new YouTubeMusicError(message, 409, "api-disabled");
  // `mine=true` on an account with no YouTube channel; Google's own words are only "Channel not found."
  if (reasons.includes("channelNotFound")) throw new YouTubeMusicError(`${NO_CHANNEL_MESSAGE} (YouTube: ${message})`, 409, "no-channel");
  throw new YouTubeMusicError(`YouTube: ${message}`, response.status === 404 ? 404 : 502, "failed");
}

/** Follows `nextPageToken` up to {@link MAX_PAGES} pages. */
async function allPages<T>(read: (pageToken: string | undefined) => Promise<{ items: Array<T>; next: string | undefined }>): Promise<Array<T>> {
  const items: Array<T> = [];
  let pageToken: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await read(pageToken);
    items.push(...result.items);
    if (result.next === undefined) break;
    pageToken = result.next;
  }
  return items;
}

const pageParams = (pageToken: string | undefined) => ({ maxResults: String(PAGE_SIZE), ...(pageToken === undefined ? {} : { pageToken }) });

/**
 * ### listPlaylists
 *
 * @returns Your liked songs first, then your playlists as YouTube orders them.
 */
export async function listPlaylists(token: string): Promise<Array<Playlist>> {
  const playlists = await allPages(async (pageToken) => {
    const page = parsePlaylists(await youtubeGet(token, "playlists", { part: "snippet,contentDetails", mine: "true", ...pageParams(pageToken) }));
    return { items: page.playlists, next: page.next };
  });
  return [LIKED_PLAYLIST, ...playlists];
}

/**
 * ### listTracks
 *
 * @param playlistId - A playlist id, or {@link LIKED_PLAYLIST_ID}.
 * @returns The playlist's playable songs in order (the first 200 videos).
 */
export async function listTracks(token: string, playlistId: string): Promise<Array<Track>> {
  if (playlistId === LIKED_PLAYLIST_ID) {
    return allPages(async (pageToken) => {
      const page = parseLikedSongs(await youtubeGet(token, "videos", { part: "snippet,contentDetails", myRating: "like", ...pageParams(pageToken) }));
      return { items: page.tracks, next: page.next };
    });
  }
  return allPages(async (pageToken) => {
    const page = parsePlaylistItems(await youtubeGet(token, "playlistItems", { part: "snippet", playlistId, ...pageParams(pageToken) }));
    return { items: page.tracks, next: page.next };
  });
}

/**
 * ### searchSongs
 *
 * Searches music videos. Costs 100 of the day's 10,000 quota units.
 */
export async function searchSongs(token: string, query: string): Promise<Array<Track>> {
  const json = await youtubeGet(token, "search", {
    part: "snippet",
    type: "video",
    videoCategoryId: MUSIC_CATEGORY,
    videoEmbeddable: "true",
    maxResults: String(SEARCH_RESULTS),
    q: query,
  });
  return parseSearch(json);
}

const channelsSchema = z.object({ items: z.array(z.object({ snippet: z.object({ title: z.string() }) })).default([]) });

/**
 * ### youtubeChannelName
 *
 * @returns Your YouTube channel's name (1 quota unit), or `undefined` for an account without a channel.
 */
export async function youtubeChannelName(token: string): Promise<string | undefined> {
  return parse(channelsSchema, await youtubeGet(token, "channels", { part: "snippet", mine: "true" }), "your channel").items[0]?.snippet.title;
}
