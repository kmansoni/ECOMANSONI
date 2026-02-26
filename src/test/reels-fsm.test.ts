import { describe, expect, it } from "vitest";
import { createInitialReelsState, reduceReels } from "@/features/reels/fsm";

const items = [
  { id: "r1", videoUrl: "https://cdn/reel-1.mp4" },
  { id: "r2", videoUrl: "https://cdn/reel-2.mp4" },
  { id: "r3", videoUrl: "https://cdn/reel-3.mp4" },
  { id: "r4", videoUrl: "https://cdn/reel-4.mp4" },
];

describe("reels fsm", () => {
  it("keeps single active player source on scroll index change", () => {
    let state = createInitialReelsState();
    state = reduceReels(state, { t: "REELS_FEED_LOADED", items }).state;

    const result = reduceReels(state, { t: "SCROLL_INDEX_CHANGED", index: 2 });

    expect(result.state.status).toBe("ITEM_PREPARING");
    expect(result.state.context.activeIndex).toBe(2);
    expect(result.state.context.activeReelId).toBe("r3");
    expect(result.effects).toEqual(
      expect.arrayContaining([
        { t: "PLAYER_DETACH" },
        { t: "PLAYER_ATTACH", reelId: "r3", url: "https://cdn/reel-3.mp4" },
      ]),
    );
  });

  it("prefetches at least two items ahead when playing", () => {
    let state = createInitialReelsState();
    state = reduceReels(state, { t: "REELS_FEED_LOADED", items }).state;
    state = reduceReels(state, { t: "PLAYER_READY" }).state;

    const result = reduceReels(state, { t: "PLAYER_PLAY" });
    expect(result.state.status).toBe("PLAYING");
    expect(result.effects).toEqual(
      expect.arrayContaining([
        { t: "PREFETCH_REEL", reelId: "r2" },
        { t: "PREFETCH_REEL", reelId: "r3" },
      ]),
    );
  });

  it("applies pause precedence: background dominates visibility and overlay", () => {
    let state = createInitialReelsState();
    state = reduceReels(state, { t: "REELS_FEED_LOADED", items }).state;
    state = reduceReels(state, { t: "PLAYER_READY" }).state;
    state = reduceReels(state, { t: "OPEN_COMMENTS" }).state;
    state = reduceReels(state, { t: "VISIBILITY_CHANGED", isVisible: false }).state;

    const result = reduceReels(state, { t: "APP_BACKGROUND" });
    expect(result.state.status).toBe("PAUSED");
    expect(result.effects).toEqual(
      expect.arrayContaining([
        { t: "PLAYER_PAUSE", reason: "background" },
      ]),
    );
  });

  it("loops on player ended only when playback policy is playing", () => {
    let state = createInitialReelsState();
    state = reduceReels(state, { t: "REELS_FEED_LOADED", items }).state;
    state = reduceReels(state, { t: "PLAYER_READY" }).state;

    const result = reduceReels(state, { t: "PLAYER_ENDED" });
    expect(result.effects).toEqual([{ t: "PLAYER_SEEK_START" }, { t: "PLAYER_PLAY" }]);

    const pausedState = reduceReels(state, { t: "OPEN_COMMENTS" }).state;
    const pausedResult = reduceReels(pausedState, { t: "PLAYER_ENDED" });
    expect(pausedResult.effects).toEqual([{ t: "NOOP" }]);
  });
});
