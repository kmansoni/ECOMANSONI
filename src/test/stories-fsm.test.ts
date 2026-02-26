import { describe, expect, it } from "vitest";
import { createInitialStoriesState, reduceStories, type StoriesMachineState } from "@/features/stories/fsm";

function withOpenPlayingState(): StoriesMachineState {
  let state = createInitialStoriesState();
  state = reduceStories(state, { t: "STORIES_TRAY_LOADED", owners: ["u1", "u2"] }).state;
  state = reduceStories(state, { t: "OPEN_VIEWER", ownerId: "u1" }).state;
  state = reduceStories(state, { t: "VIEWER_OPENED" }).state;
  state = reduceStories(state, {
    t: "SEGMENT_META_LOADED",
    segments: [
      { id: "s1", mediaType: "image", durationMs: 5000 },
      { id: "s2", mediaType: "video", durationMs: 8000 },
    ],
  }).state;
  return state;
}

describe("stories fsm", () => {
  it("requests prefetch for next segment and next story when segment starts playing", () => {
    const state = withOpenPlayingState();
    const result = reduceStories(state, { t: "SEGMENT_MEDIA_READY" });

    expect(result.state.status).toBe("SEGMENT_PLAYING");
    expect(result.effects).toEqual(
      expect.arrayContaining([
        { t: "PREFETCH_REQUEST", target: "nextSegment" },
        { t: "PREFETCH_REQUEST", target: "nextStoryFirstSegment" },
      ]),
    );
  });

  it("applies pause precedence: app background dominates overlay and long press", () => {
    let state = withOpenPlayingState();
    state = reduceStories(state, { t: "SEGMENT_MEDIA_READY" }).state;
    state = reduceStories(state, { t: "LONG_PRESS_START" }).state;
    state = reduceStories(state, { t: "OVERLAY_OPEN", name: "menu" }).state;

    const result = reduceStories(state, { t: "APP_BACKGROUND" });
    expect(result.state.status).toBe("SEGMENT_PAUSED");
    expect(result.effects).toEqual([{ t: "PLAYER_PAUSE", reason: "background" }]);
  });

  it("tap right on last segment goes to next story", () => {
    let state = withOpenPlayingState();
    state = reduceStories(state, { t: "SEGMENT_MEDIA_READY" }).state;
    state = {
      ...state,
      context: {
        ...state.context,
        currentSegmentIndex: 1,
      },
    };

    const result = reduceStories(state, { t: "TAP_RIGHT" });
    expect(result.state.status).toBe("TRANSITIONING");
    expect(result.state.context.currentOwnerIndex).toBe(1);
    expect(result.effects).toEqual([{ t: "LOAD_SEGMENT_META", ownerId: "u2" }]);
  });

  it("close viewer stops player, cancels prefetch, flushes seen queue", () => {
    const state = withOpenPlayingState();
    const result = reduceStories(state, { t: "CLOSE_VIEWER", reason: "swipe_down" });

    expect(result.state.status).toBe("VIEWER_CLOSING");
    expect(result.effects).toEqual(
      expect.arrayContaining([
        { t: "PLAYER_STOP" },
        { t: "PREFETCH_CANCEL_ALL" },
        { t: "SEEN_FLUSH" },
      ]),
    );
  });
});
