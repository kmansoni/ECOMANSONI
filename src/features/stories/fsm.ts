export type StoriesStateStatus =
  | "IDLE"
  | "BOOTSTRAP"
  | "TRAY_READY"
  | "VIEWER_OPENING"
  | "SEGMENT_LOADING"
  | "SEGMENT_PLAYING"
  | "SEGMENT_PAUSED"
  | "SEGMENT_BUFFERING"
  | "TRANSITIONING"
  | "VIEWER_CLOSING"
  | "ERROR";

export interface StoriesSegment {
  id: string;
  mediaType: "image" | "video";
  durationMs?: number;
}

export interface StoriesContext {
  ownerChain: string[];
  currentOwnerIndex: number;
  currentStoryId: string | null;
  segments: StoriesSegment[];
  currentSegmentIndex: number;
  progressMs: number;
  segmentDurationMs: number;
  isMuted: boolean;
  overlayOpenCount: number;
  isAppBackground: boolean;
  isLongPressing: boolean;
  isBuffering: boolean;
  lastErrorCode?: string;
  lastErrorMessage?: string;
}

export interface StoriesMachineState {
  status: StoriesStateStatus;
  context: StoriesContext;
}

export type StoriesEvent =
  | { t: "STORIES_TRAY_LOADED"; owners: string[] }
  | { t: "OPEN_VIEWER"; ownerId: string; storyId?: string }
  | { t: "VIEWER_OPENED" }
  | { t: "CLOSE_VIEWER"; reason: "swipe_down" | "back" | "end_of_chain" | "route_change" }
  | { t: "VIEWER_CLOSED" }
  | { t: "SEGMENT_META_LOADED"; segments: StoriesSegment[] }
  | { t: "SEGMENT_MEDIA_READY" }
  | { t: "TAP_RIGHT" }
  | { t: "TAP_LEFT" }
  | { t: "SWIPE_LEFT" }
  | { t: "SWIPE_RIGHT" }
  | { t: "NEXT_SEGMENT" }
  | { t: "PREV_SEGMENT" }
  | { t: "NEXT_STORY" }
  | { t: "PREV_STORY" }
  | { t: "PROGRESS_TICK"; deltaMs: number }
  | { t: "SEGMENT_ENDED" }
  | { t: "LONG_PRESS_START" }
  | { t: "LONG_PRESS_END" }
  | { t: "OVERLAY_OPEN"; name: string }
  | { t: "OVERLAY_CLOSE"; name: string }
  | { t: "APP_BACKGROUND" }
  | { t: "APP_FOREGROUND" }
  | { t: "NETWORK_CHANGED" }
  | { t: "SEGMENT_BUFFERING_START" }
  | { t: "SEGMENT_BUFFERING_END" }
  | { t: "MUTE_TOGGLE" }
  | { t: "MARK_SEEN_REQUEST"; storyId: string; segmentId: string }
  | { t: "MARK_SEEN_OK" }
  | { t: "MARK_SEEN_FAIL"; retryable: boolean }
  | { t: "ERROR"; code: string; message: string };

export type StoriesEffect =
  | { t: "ROUTE_OPEN_VIEWER"; ownerId: string; storyId?: string }
  | { t: "ROUTE_CLOSE_VIEWER"; reason: "swipe_down" | "back" | "end_of_chain" | "route_change" }
  | { t: "LOAD_OWNER_CHAIN" }
  | { t: "LOAD_SEGMENT_META"; ownerId: string; storyId?: string }
  | { t: "PREFETCH_REQUEST"; target: "nextSegment" | "nextStoryFirstSegment" }
  | { t: "PREFETCH_CANCEL_ALL" }
  | { t: "PLAYER_PLAY" }
  | { t: "PLAYER_PAUSE"; reason: "background" | "overlay" | "long_press" | "buffering" }
  | { t: "PLAYER_STOP" }
  | { t: "SEEN_ENQUEUE"; storyId: string; segmentId: string }
  | { t: "SEEN_FLUSH" }
  | { t: "NOOP" };

const DEFAULT_IMAGE_DURATION_MS = 5000;

function clampIndex(index: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, index));
}

function computePlaybackStatus(context: StoriesContext): StoriesStateStatus {
  if (context.isAppBackground) return "SEGMENT_PAUSED";
  if (context.overlayOpenCount > 0) return "SEGMENT_PAUSED";
  if (context.isLongPressing) return "SEGMENT_PAUSED";
  if (context.isBuffering) return "SEGMENT_BUFFERING";
  return "SEGMENT_PLAYING";
}

function pauseReason(context: StoriesContext): "background" | "overlay" | "long_press" | "buffering" {
  if (context.isAppBackground) return "background";
  if (context.overlayOpenCount > 0) return "overlay";
  if (context.isLongPressing) return "long_press";
  return "buffering";
}

function toPlayingWithPrefetch(context: StoriesContext): { status: StoriesStateStatus; effects: StoriesEffect[] } {
  const status = computePlaybackStatus(context);
  if (status === "SEGMENT_PLAYING") {
    return {
      status,
      effects: [
        { t: "PLAYER_PLAY" },
        { t: "PREFETCH_REQUEST", target: "nextSegment" },
        { t: "PREFETCH_REQUEST", target: "nextStoryFirstSegment" },
      ],
    };
  }

  return {
    status,
    effects: [{ t: "PLAYER_PAUSE", reason: pauseReason(context) }],
  };
}

export function createInitialStoriesState(): StoriesMachineState {
  return {
    status: "IDLE",
    context: {
      ownerChain: [],
      currentOwnerIndex: 0,
      currentStoryId: null,
      segments: [],
      currentSegmentIndex: 0,
      progressMs: 0,
      segmentDurationMs: DEFAULT_IMAGE_DURATION_MS,
      isMuted: true,
      overlayOpenCount: 0,
      isAppBackground: false,
      isLongPressing: false,
      isBuffering: false,
    },
  };
}

export function reduceStories(
  prev: StoriesMachineState,
  event: StoriesEvent,
): { state: StoriesMachineState; effects: StoriesEffect[] } {
  const context = prev.context;

  switch (event.t) {
    case "STORIES_TRAY_LOADED": {
      const next: StoriesMachineState = {
        status: "TRAY_READY",
        context: {
          ...context,
          ownerChain: event.owners,
          currentOwnerIndex: clampIndex(context.currentOwnerIndex, 0, Math.max(0, event.owners.length - 1)),
        },
      };
      return { state: next, effects: [{ t: "NOOP" }] };
    }

    case "OPEN_VIEWER": {
      const ownerIndex = Math.max(0, context.ownerChain.indexOf(event.ownerId));
      const next: StoriesMachineState = {
        status: "VIEWER_OPENING",
        context: {
          ...context,
          currentOwnerIndex: ownerIndex,
          currentStoryId: event.storyId ?? null,
          currentSegmentIndex: 0,
          progressMs: 0,
          segments: [],
        },
      };

      return {
        state: next,
        effects: [
          { t: "ROUTE_OPEN_VIEWER", ownerId: event.ownerId, storyId: event.storyId },
          { t: "LOAD_SEGMENT_META", ownerId: event.ownerId, storyId: event.storyId },
        ],
      };
    }

    case "VIEWER_OPENED": {
      return {
        state: { ...prev, status: "SEGMENT_LOADING" },
        effects: [{ t: "NOOP" }],
      };
    }

    case "SEGMENT_META_LOADED": {
      const currentSegment = event.segments[0];
      const durationMs = currentSegment?.mediaType === "video"
        ? Math.max(1, currentSegment.durationMs ?? DEFAULT_IMAGE_DURATION_MS)
        : DEFAULT_IMAGE_DURATION_MS;

      return {
        state: {
          status: "SEGMENT_LOADING",
          context: {
            ...context,
            segments: event.segments,
            currentSegmentIndex: 0,
            progressMs: 0,
            segmentDurationMs: durationMs,
          },
        },
        effects: [{ t: "NOOP" }],
      };
    }

    case "SEGMENT_MEDIA_READY": {
      const transition = toPlayingWithPrefetch(context);
      return {
        state: {
          status: transition.status,
          context,
        },
        effects: transition.effects,
      };
    }

    case "TAP_RIGHT":
    case "NEXT_SEGMENT":
    case "SEGMENT_ENDED": {
      if (context.currentSegmentIndex < context.segments.length - 1) {
        const nextIndex = context.currentSegmentIndex + 1;
        const segment = context.segments[nextIndex];
        const durationMs = segment?.mediaType === "video"
          ? Math.max(1, segment.durationMs ?? DEFAULT_IMAGE_DURATION_MS)
          : DEFAULT_IMAGE_DURATION_MS;

        return {
          state: {
            status: "TRANSITIONING",
            context: {
              ...context,
              currentSegmentIndex: nextIndex,
              progressMs: 0,
              segmentDurationMs: durationMs,
              isBuffering: segment?.mediaType === "video",
            },
          },
          effects: [{ t: "NOOP" }],
        };
      }

      return reduceStories(prev, { t: "NEXT_STORY" });
    }

    case "TAP_LEFT":
    case "PREV_SEGMENT": {
      if (context.currentSegmentIndex > 0) {
        const nextIndex = context.currentSegmentIndex - 1;
        const segment = context.segments[nextIndex];
        const durationMs = segment?.mediaType === "video"
          ? Math.max(1, segment.durationMs ?? DEFAULT_IMAGE_DURATION_MS)
          : DEFAULT_IMAGE_DURATION_MS;

        return {
          state: {
            status: "TRANSITIONING",
            context: {
              ...context,
              currentSegmentIndex: nextIndex,
              progressMs: 0,
              segmentDurationMs: durationMs,
              isBuffering: segment?.mediaType === "video",
            },
          },
          effects: [{ t: "NOOP" }],
        };
      }

      return reduceStories(prev, { t: "PREV_STORY" });
    }

    case "SWIPE_LEFT":
    case "NEXT_STORY": {
      if (context.currentOwnerIndex >= context.ownerChain.length - 1) {
        return reduceStories(prev, { t: "CLOSE_VIEWER", reason: "end_of_chain" });
      }

      const ownerId = context.ownerChain[context.currentOwnerIndex + 1];
      return {
        state: {
          status: "TRANSITIONING",
          context: {
            ...context,
            currentOwnerIndex: context.currentOwnerIndex + 1,
            currentStoryId: null,
            currentSegmentIndex: 0,
            segments: [],
            progressMs: 0,
            segmentDurationMs: DEFAULT_IMAGE_DURATION_MS,
          },
        },
        effects: [{ t: "LOAD_SEGMENT_META", ownerId }],
      };
    }

    case "SWIPE_RIGHT":
    case "PREV_STORY": {
      if (context.currentOwnerIndex <= 0) {
        return {
          state: {
            ...prev,
            context: {
              ...context,
              progressMs: 0,
              currentSegmentIndex: 0,
            },
          },
          effects: [{ t: "NOOP" }],
        };
      }

      const ownerId = context.ownerChain[context.currentOwnerIndex - 1];
      return {
        state: {
          status: "TRANSITIONING",
          context: {
            ...context,
            currentOwnerIndex: context.currentOwnerIndex - 1,
            currentStoryId: null,
            currentSegmentIndex: 0,
            segments: [],
            progressMs: 0,
            segmentDurationMs: DEFAULT_IMAGE_DURATION_MS,
          },
        },
        effects: [{ t: "LOAD_SEGMENT_META", ownerId }],
      };
    }

    case "PROGRESS_TICK": {
      if (prev.status !== "SEGMENT_PLAYING") {
        return { state: prev, effects: [{ t: "NOOP" }] };
      }

      const progressMs = context.progressMs + Math.max(0, event.deltaMs);
      if (progressMs >= context.segmentDurationMs) {
        return reduceStories(
          {
            ...prev,
            context: {
              ...context,
              progressMs: context.segmentDurationMs,
            },
          },
          { t: "SEGMENT_ENDED" },
        );
      }

      return {
        state: {
          ...prev,
          context: {
            ...context,
            progressMs,
          },
        },
        effects: [{ t: "NOOP" }],
      };
    }

    case "LONG_PRESS_START": {
      const nextContext = { ...context, isLongPressing: true };
      const status = computePlaybackStatus(nextContext);
      return {
        state: { status, context: nextContext },
        effects: [{ t: "PLAYER_PAUSE", reason: pauseReason(nextContext) }],
      };
    }

    case "LONG_PRESS_END": {
      const nextContext = { ...context, isLongPressing: false };
      const transition = toPlayingWithPrefetch(nextContext);
      return {
        state: { status: transition.status, context: nextContext },
        effects: transition.effects,
      };
    }

    case "OVERLAY_OPEN": {
      const nextContext = { ...context, overlayOpenCount: context.overlayOpenCount + 1 };
      const status = computePlaybackStatus(nextContext);
      return {
        state: { status, context: nextContext },
        effects: [{ t: "PLAYER_PAUSE", reason: pauseReason(nextContext) }],
      };
    }

    case "OVERLAY_CLOSE": {
      const nextContext = { ...context, overlayOpenCount: Math.max(0, context.overlayOpenCount - 1) };
      const transition = toPlayingWithPrefetch(nextContext);
      return {
        state: { status: transition.status, context: nextContext },
        effects: transition.effects,
      };
    }

    case "SEGMENT_BUFFERING_START": {
      const nextContext = { ...context, isBuffering: true };
      const status = computePlaybackStatus(nextContext);
      return {
        state: { status, context: nextContext },
        effects: [{ t: "PLAYER_PAUSE", reason: pauseReason(nextContext) }],
      };
    }

    case "SEGMENT_BUFFERING_END": {
      const nextContext = { ...context, isBuffering: false };
      const transition = toPlayingWithPrefetch(nextContext);
      return {
        state: { status: transition.status, context: nextContext },
        effects: transition.effects,
      };
    }

    case "APP_BACKGROUND": {
      const nextContext = { ...context, isAppBackground: true };
      return {
        state: { status: "SEGMENT_PAUSED", context: nextContext },
        effects: [{ t: "PLAYER_PAUSE", reason: "background" }],
      };
    }

    case "APP_FOREGROUND": {
      const nextContext = { ...context, isAppBackground: false };
      const transition = toPlayingWithPrefetch(nextContext);
      return {
        state: { status: transition.status, context: nextContext },
        effects: transition.effects,
      };
    }

    case "MUTE_TOGGLE": {
      return {
        state: {
          ...prev,
          context: {
            ...context,
            isMuted: !context.isMuted,
          },
        },
        effects: [{ t: "NOOP" }],
      };
    }

    case "MARK_SEEN_REQUEST": {
      return {
        state: prev,
        effects: [{ t: "SEEN_ENQUEUE", storyId: event.storyId, segmentId: event.segmentId }],
      };
    }

    case "MARK_SEEN_OK": {
      return { state: prev, effects: [{ t: "NOOP" }] };
    }

    case "MARK_SEEN_FAIL": {
      return {
        state: prev,
        effects: [event.retryable ? { t: "SEEN_FLUSH" } : { t: "NOOP" }],
      };
    }

    case "NETWORK_CHANGED": {
      return {
        state: prev,
        effects: [{ t: "SEEN_FLUSH" }],
      };
    }

    case "CLOSE_VIEWER": {
      return {
        state: {
          ...prev,
          status: "VIEWER_CLOSING",
        },
        effects: [
          { t: "PLAYER_STOP" },
          { t: "PREFETCH_CANCEL_ALL" },
          { t: "SEEN_FLUSH" },
          { t: "ROUTE_CLOSE_VIEWER", reason: event.reason },
        ],
      };
    }

    case "VIEWER_CLOSED": {
      return {
        state: createInitialStoriesState(),
        effects: [{ t: "NOOP" }],
      };
    }

    case "ERROR": {
      return {
        state: {
          status: "ERROR",
          context: {
            ...context,
            lastErrorCode: event.code,
            lastErrorMessage: event.message,
          },
        },
        effects: [{ t: "PLAYER_STOP" }],
      };
    }

    default:
      return { state: prev, effects: [{ t: "NOOP" }] };
  }
}
