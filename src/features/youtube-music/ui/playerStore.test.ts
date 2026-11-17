import { beforeEach, describe, expect, it, vi } from "vitest";
import { musicPlayer, type PlayerController } from "@/features/youtube-music/ui/playerStore";

const track = (videoId: string) => ({ videoId, title: `Song ${videoId}`, artist: undefined, durationSeconds: undefined, thumbnail: undefined });
const queue = ["a", "b", "c"].map(track);

function controller(at = 0) {
  return {
    load: vi.fn<(videoId: string) => void>(),
    play: vi.fn<() => void>(),
    pause: vi.fn<() => void>(),
    restart: vi.fn<() => void>(),
    currentTime: () => at,
  } satisfies PlayerController;
}

describe("musicPlayer", () => {
  let detach: () => void = () => {};
  beforeEach(() => {
    detach();
    musicPlayer.stop();
  });

  it("loads the queued song once the player is ready", () => {
    musicPlayer.playQueue(queue, 1, "Focus");
    const player = controller();
    detach = musicPlayer.attach(player);
    expect(player.load).toHaveBeenCalledWith("b");
    expect(musicPlayer.snapshot()).toMatchObject({ index: 1, status: "loading", source: "Focus" });
  });

  it("moves on when a song ends, and stops at the end of the queue", () => {
    const player = controller();
    detach = musicPlayer.attach(player);
    musicPlayer.playQueue(queue, 1, "Focus");
    musicPlayer.report("ended");
    expect(player.load).toHaveBeenLastCalledWith("c");
    musicPlayer.report("ended");
    expect(musicPlayer.snapshot().status).toBe("ended");
  });

  it("skips a song the owner keeps off embedded players, and remembers it", () => {
    const player = controller();
    detach = musicPlayer.attach(player);
    musicPlayer.playQueue(queue, 0, "Focus");
    musicPlayer.reportError(150);
    expect(player.load).toHaveBeenLastCalledWith("b");
    expect(musicPlayer.snapshot().error).toMatch(/Skipped “Song a”/);
    expect(musicPlayer.snapshot().unplayable.has("a")).toBe(true);
    // Playing the list again from the refused song starts at the next one.
    musicPlayer.playQueue(queue, 0, "Focus");
    expect(musicPlayer.snapshot().index).toBe(1);
  });

  it("stops skipping when every song is refused, since then the player is the problem", () => {
    const many = ["p", "q", "r", "s", "t"].map(track);
    const player = controller();
    detach = musicPlayer.attach(player);
    musicPlayer.playQueue(many, 0, "All refused");
    musicPlayer.reportError(150);
    musicPlayer.reportError(150);
    musicPlayer.reportError(150);
    const state = musicPlayer.snapshot();
    expect(state.status).toBe("paused");
    expect(state.error).toMatch(/refusing every song/);
    expect(["p", "q", "r"].some((id) => state.unplayable.has(id))).toBe(false);
    expect(player.load).toHaveBeenCalledTimes(3);
  });

  it("restarts the song a few seconds in instead of going back", () => {
    const late = controller(10);
    detach = musicPlayer.attach(late);
    musicPlayer.playQueue(queue, 2, "Focus");
    musicPlayer.previous();
    expect(late.restart).toHaveBeenCalled();
    expect(musicPlayer.snapshot().index).toBe(2);
    detach();
    const early = controller(1);
    detach = musicPlayer.attach(early);
    musicPlayer.previous();
    expect(musicPlayer.snapshot().index).toBe(1);
  });
});
