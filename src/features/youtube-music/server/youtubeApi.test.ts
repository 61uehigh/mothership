import { afterEach, describe, expect, it, vi } from "vitest";
import { listPlaylists, parseLikedSongs, parsePlaylistItems, parsePlaylists, parseSearch, youtubeGet } from "@/features/youtube-music/server/youtubeApi";

const thumbs = { default: { url: "https://i.ytimg.com/d.jpg" }, medium: { url: "https://i.ytimg.com/m.jpg" } };

afterEach(() => vi.unstubAllGlobals());

describe("parsePlaylists", () => {
  it("rejects an unexpected shape", () => {
    expect(() => parsePlaylists({ items: [{ id: 3 }] })).toThrow(/unexpected shape/);
  });
});

describe("parsePlaylistItems", () => {
  it("drops deleted and private videos, which have no owner", () => {
    const result = parsePlaylistItems({
      items: [
        { snippet: { title: "Song", resourceId: { videoId: "v1" }, videoOwnerChannelTitle: "Artist - Topic", thumbnails: thumbs } },
        { snippet: { title: "Deleted video", resourceId: { videoId: "v2" }, thumbnails: {} } },
      ],
    });
    expect(result.tracks).toEqual([{ videoId: "v1", title: "Song", artist: "Artist", durationSeconds: undefined, thumbnail: "https://i.ytimg.com/m.jpg" }]);
    expect(result.next).toBeUndefined();
  });
});

describe("parseLikedSongs", () => {
  it("keeps liked videos in the Music category, with their length", () => {
    const result = parseLikedSongs({
      items: [
        { id: "m1", snippet: { title: "Song", channelTitle: "Band - Topic", categoryId: "10", thumbnails: thumbs }, contentDetails: { duration: "PT4M1S" } },
        { id: "t1", snippet: { title: "Talk", channelTitle: "Conf", categoryId: "28", thumbnails: thumbs }, contentDetails: { duration: "PT40M" } },
      ],
    });
    expect(result.tracks).toEqual([{ videoId: "m1", title: "Song", artist: "Band", durationSeconds: 241, thumbnail: "https://i.ytimg.com/m.jpg" }]);
  });
});

describe("parseSearch", () => {
  it("unescapes the HTML entities search titles come with and skips non-videos", () => {
    const tracks = parseSearch({
      items: [
        { id: { videoId: "s1" }, snippet: { title: "Rock &amp; Roll &#39;Live&#39;", channelTitle: "A &amp; B", thumbnails: thumbs } },
        { id: {}, snippet: { title: "A channel", thumbnails: thumbs } },
      ],
    });
    expect(tracks).toEqual([{ videoId: "s1", title: "Rock & Roll 'Live'", artist: "A & B", durationSeconds: undefined, thumbnail: "https://i.ytimg.com/m.jpg" }]);
  });
});

function answer(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

describe("youtubeGet", () => {
  it("names a used-up quota", async () => {
    vi.stubGlobal("fetch", answer(403, { error: { message: "quota", errors: [{ reason: "quotaExceeded" }] } }));
    await expect(youtubeGet("tok", "search", {})).rejects.toMatchObject({ code: "quota", status: 429 });
  });

  it("names a refused token and a disabled API", async () => {
    vi.stubGlobal("fetch", answer(401, { error: { message: "Invalid Credentials", errors: [{ reason: "authError" }] } }));
    await expect(youtubeGet("tok", "playlists", {})).rejects.toMatchObject({ code: "expired" });
    vi.stubGlobal("fetch", answer(403, { error: { message: "not enabled", errors: [{ reason: "accessNotConfigured" }] } }));
    await expect(youtubeGet("tok", "playlists", {})).rejects.toMatchObject({ code: "api-disabled", message: "not enabled" });
  });
});

describe("youtubeGet: an account without a channel", () => {
  it("says the account has no channel instead of Google's bare 'Channel not found.'", async () => {
    vi.stubGlobal("fetch", answer(404, { error: { message: "Channel not found.", errors: [{ reason: "channelNotFound" }] } }));
    await expect(youtubeGet("tok", "playlists", { mine: "true" })).rejects.toMatchObject({ code: "no-channel", message: expect.stringContaining("has no YouTube channel") });
  });
});

describe("listPlaylists", () => {
  it("puts liked songs first and follows pages", async () => {
    const pages = [
      { nextPageToken: "p2", items: [{ id: "PL1", snippet: { title: "One", thumbnails: {} } }] },
      { items: [{ id: "PL2", snippet: { title: "Two", thumbnails: {} } }] },
    ];
    const fetch = vi.fn(async () => new Response(JSON.stringify(pages.shift())));
    vi.stubGlobal("fetch", fetch);
    const playlists = await listPlaylists("tok");
    expect(playlists.map((p) => p.id)).toEqual(["liked", "PL1", "PL2"]);
    expect(String((fetch.mock.calls[1] as unknown as [string])[0])).toContain("pageToken=p2");
  });
});
