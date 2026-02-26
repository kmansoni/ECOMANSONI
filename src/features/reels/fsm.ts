export type ReelsStateStatus =
  | "IDLE"
  | "BOOTSTRAP"
  | "FEED_READY"
  | "ITEM_PREPARING"
  | "PLAYING"
  | "PAUSED"
  | "BUFFERING"
  | "ERROR";

export interface ReelsItem {
  id: string;
  videoUrl: string;
  posterUrl?: string;
}

export interface ReelsContext {
  items: ReelsItem[];
  activeIndex: number;
  activeReelId: string | null;
  isMuted: boolean;
  isVisible: boolean;
  isAppBackground: boolean;
  overlayOpenCount: number;
  isBuffering: boolean;
  isTapPaused: boolean;
  watchStartMs?: number;
  watchAccumulatedMs: number;
  lastErrorCode?: string;
  lastErrorMessage?: string;
}

export interface ReelsMachineState {
  status: ReelsStateStatus;
  context: ReelsContext;
}

export type ReelsEvent =
  | { t: "OPEN_REELS"; initialReelId?: string }
  | { t: "REELS_FEED_LOADED"; items: ReelsItem[] }
  | { t: "REELS_FEED_APPEND"; items: ReelsItem[] }
  | { t: "SCROLL_INDEX_CHANGED"; index: number }
  | { t: "ACTIVE_ITEM_SET"; index: number; reelId: string }
  | { t: "PLAYER_ATTACH_SOURCE"; reelId: string; url: string }
  | { t: "PLAYER_READY" }
  | { t: "PLAYER_PLAY" }
  | { t: "PLAYER_PAUSE"; reason: "tap" | "overlay" | "background" | "visibility" }
  | { t: "PLAYER_BUFFERING_START" }
  | { t: "PLAYER_BUFFERING_END" }
  | { t: "PLAYER_ENDED" }
  | { t: "MUTE_TOGGLE" }
  | { t: "LIKE_TOGGLE" }
  | { t: "SAVE_TOGGLE" }
  | { t: "OPEN_COMMENTS" }
  | { t: "CLOSE_COMMENTS" }
  | { t: "SHARE_OPEN" }
  | { t: "SHARE_CLOSE" }
  | { t: "WATCH_START"; reelId: string }
  | { t: "WATCH_PROGRESS"; reelId: string; ms: number }
  | { t: "WATCH_COMPLETE"; reelId: string }
  | { t: "WATCH_STOP"; reelId: string; reason: "scroll" | "close" | "background" | "overlay" }
  | { t: "VISIBILITY_CHANGED"; isVisible: boolean }
  | { t: "APP_BACKGROUND" }
  | { t: "APP_FOREGROUND" }
  | { t: "NETWORK_CHANGED" }
  | { t: "CLOSE_REELS"; reason: "back" | "route_change" }
  | { t: "ERROR"; code: string; message: string };

export type ReelsEffect =
  | { t: "ROUTE_OPEN_REELS"; initialReelId?: string }
  | { t: "ROUTE_CLOSE_REELS"; reason: "back" | "route_change" }
  | { t: "LOAD_REELS_FEED"; initialReelId?: string }
  | { t: "PLAYER_DETACH" }
  | { t: "PLAYER_ATTACH"; reelId: string; url: string }
  | { t: "PLAYER_PLAY" }
  | { t: "PLAYER_PAUSE"; reason: "tap" | "overlay" | "background" | "visibility" }
  | { t: "PLAYER_SEEK_START" }
  | { t: "PREFETCH_REEL"; reelId: string }
  | { t: "WATCH_EMIT_START"; reelId: string }
  | { t: "WATCH_EMIT_PROGRESS"; reelId: string; ms: number }
  | { t: "WATCH_EMIT_COMPLETE"; reelId: string }
  | { t: "WATCH_EMIT_STOP"; reelId: string; reason: "scroll" | "close" | "background" | "overlay" }
  | { t: "NOOP" };

function clampIndex(index: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, index));
}

function resolvePlaybackStatus(context: ReelsContext): ReelsStateStatus {
  if (context.isAppBackground) return "PAUSED";
  if (!context.isVisible) return "PAUSED";
  if (context.overlayOpenCount > 0) return "PAUSED";
  if (context.isBuffering) return "BUFFERING";
  if (context.isTapPaused) return "PAUSED";
  return "PLAYING";
}

function pauseReason(context: ReelsContext): "tap" | "overlay" | "background" | "visibility" {
  if (context.isAppBackground) return "background";
  if (!context.isVisible) return "visibility";
  if (context.overlayOpenCount > 0) return "overlay";
  return "tap";
}

function itemByIndex(context: ReelsContext, index: number): ReelsItem | undefined {
  return context.items[index];
}

function playWithPrefetch(context: ReelsContext): { status: ReelsStateStatus; effects: ReelsEffect[] } {
  const status = resolvePlaybackStatus(context);
  const active = context.activeReelId;
  const effects: ReelsEffect[] = [];

  if (status === "PLAYING") {
    effects.push({ t: "PLAYER_PLAY" });

    if (active) {
      effects.push({ t: "WATCH_EMIT_START", reelId: active });
      const next1 = itemByIndex(context, context.activeIndex + 1);
      const next2 = itemByIndex(context, context.activeIndex + 2);
      if (next1) effects.push({ t: "PREFETCH_REEL", reelId: next1.id });
      if (next2) effects.push({ t: "PREFETCH_REEL", reelId: next2.id });
    }
  } else {
    effects.push({ t: "PLAYER_PAUSE", reason: pauseReason(context) });
  }

  return { status, effects };
}

export function createInitialReelsState(): ReelsMachineState {
  return {
    status: "IDLE",
    context: {
      items: [],
      activeIndex: 0,
      activeReelId: null,
      isMuted: true,
      isVisible: true,
      isAppBackground: false,
      overlayOpenCount: 0,
      isBuffering: false,
      isTapPaused: false,
      watchAccumulatedMs: 0,
    },
  };
}

export function reduceReels(
  prev: ReelsMachineState,
  event: ReelsEvent,
): { state: ReelsMachineState; effects: ReelsEffect[] } {
  const context = prev.context;

  switch (event.t) {
    case "OPEN_REELS": {
      return {
        state: {
          ...prev,
          status: "BOOTSTRAP",
        },
        effects: [
          { t: "ROUTE_OPEN_REELS", initialReelId: event.initialReelId },
          { t: "LOAD_REELS_FEED", initialReelId: event.initialReelId },
        ],
      };
    }

    case "REELS_FEED_LOADED": {
      const first = event.items[0];
      return {
        state: {
          status: event.items.length > 0 ? "ITEM_PREPARING" : "FEED_READY",
          context: {
            ...context,
            items: event.items,
            activeIndex: 0,
            activeReelId: first?.id ?? null,
          },
        },
        effects: first
          ? [
              { t: "PLAYER_DETACH" },
              { t: "PLAYER_ATTACH", reelId: first.id, url: first.videoUrl },
            ]
          : [{ t: "NOOP" }],
      };
    }

    case "REELS_FEED_APPEND": {
      return {
        state: {
          ...prev,
          context: {
            ...context,
            items: [...context.items, ...event.items],
          },
        },
        effects: [{ t: "NOOP" }],
      };
    }

    case "SCROLL_INDEX_CHANGED": {
      if (context.items.length === 0) {
        return { state: prev, effects: [{ t: "NOOP" }] };
      }

      const nextIndex = clampIndex(event.index, 0, context.items.length - 1);
      if (nextIndex === context.activeIndex) {
        return { state: prev, effects: [{ t: "NOOP" }] };
      }

      const prevActive = context.activeReelId;
      const nextItem = context.items[nextIndex];
      const nextContext: ReelsContext = {
        ...context,
        activeIndex: nextIndex,
        activeReelId: nextItem.id,
        isBuffering: true,
        isTapPaused: false,
      };

      return {
        state: {
          status: "ITEM_PREPARING",
          context: nextContext,
        },
        effects: [
          ...(prevActive ? [{ t: "WATCH_EMIT_STOP", reelId: prevActive, reason: "scroll" } as const] : []),
          { t: "PLAYER_DETACH" },
          { t: "PLAYER_ATTACH", reelId: nextItem.id, url: nextItem.videoUrl },
        ],
      };
    }

    case "ACTIVE_ITEM_SET": {
      return reduceReels(prev, { t: "SCROLL_INDEX_CHANGED", index: event.index });
    }

    case "PLAYER_ATTACH_SOURCE": {
      return {
        state: {
          ...prev,
          status: "ITEM_PREPARING",
          context: {
            ...context,
            activeReelId: event.reelId,
            isBuffering: true,
          },
        },
        effects: [
          { t: "PLAYER_DETACH" },
          { t: "PLAYER_ATTACH", reelId: event.reelId, url: event.url },
        ],
      };
    }

    case "PLAYER_READY": {
      const nextContext = { ...context, isBuffering: false };
      const transition = playWithPrefetch(nextContext);
      return {
        state: { status: transition.status, context: nextContext },
        effects: transition.effects,
      };
    }

    case "PLAYER_PLAY": {
      const nextContext = { ...context, isTapPaused: false };
      const transition = playWithPrefetch(nextContext);
      return {
        state: { status: transition.status, context: nextContext },
        effects: transition.effects,
      };
    }

    case "PLAYER_PAUSE": {
      const nextContext = {
        ...context,
        isTapPaused: event.reason === "tap" ? true : context.isTapPaused,
      };
      return {
        state: { status: "PAUSED", context: nextContext },
        effects: [
          { t: "PLAYER_PAUSE", reason: event.reason },
          ...(context.activeReelId
            ? [{ t: "WATCH_EMIT_STOP", reelId: context.activeReelId, reason: event.reason === "tap" ? "overlay" : event.reason } as const]
            : []),
        ],
      };
    }

    case "PLAYER_BUFFERING_START": {
      const nextContext = { ...context, isBuffering: true };
      const status = resolvePlaybackStatus(nextContext);
      return {
        state: { status, context: nextContext },
        effects: status === "BUFFERING"
          ? [{ t: "PLAYER_PAUSE", reason: pauseReason(nextContext) }]
          : [{ t: "NOOP" }],
      };
    }

    case "PLAYER_BUFFERING_END": {
      const nextContext = { ...context, isBuffering: false };
      const transition = playWithPrefetch(nextContext);
      return {
        state: { status: transition.status, context: nextContext },
        effects: transition.effects,
      };
    }

    case "PLAYER_ENDED": {
      if (resolvePlaybackStatus(context) === "PLAYING") {
        return {
          state: prev,
          effects: [{ t: "PLAYER_SEEK_START" }, { t: "PLAYER_PLAY" }],
        };
      }
      return { state: prev, effects: [{ t: "NOOP" }] };
    }

    case "OPEN_COMMENTS":
    case "SHARE_OPEN": {
      const nextContext = { ...context, overlayOpenCount: context.overlayOpenCount + 1 };
      return {
        state: { status: "PAUSED", context: nextContext },
        effects: [{ t: "PLAYER_PAUSE", reason: "overlay" }],
      };
    }

    case "CLOSE_COMMENTS":
    case "SHARE_CLOSE": {
      const nextContext = { ...context, overlayOpenCount: Math.max(0, context.overlayOpenCount - 1) };
      const transition = playWithPrefetch(nextContext);
      return {
        state: { status: transition.status, context: nextContext },
        effects: transition.effects,
      };
    }

    case "VISIBILITY_CHANGED": {
      const nextContext = { ...context, isVisible: event.isVisible };
      const transition = playWithPrefetch(nextContext);
      return {
        state: { status: transition.status, context: nextContext },
        effects: transition.effects,
      };
    }

    case "APP_BACKGROUND": {
      const nextContext = { ...context, isAppBackground: true };
      return {
        state: { status: "PAUSED", context: nextContext },
        effects: [
          { t: "PLAYER_PAUSE", reason: "background" },
          ...(context.activeReelId
            ? [{ t: "WATCH_EMIT_STOP", reelId: context.activeReelId, reason: "background" } as const]
            : []),
        ],
      };
    }

    case "APP_FOREGROUND": {
      const nextContext = { ...context, isAppBackground: false };
      const transition = playWithPrefetch(nextContext);
      return {
        state: { status: transition.status, context: nextContext },
        effects: transition.effects,
      };
    }

    case "WATCH_PROGRESS": {
      if (event.reelId !== context.activeReelId) {
        return { state: prev, effects: [{ t: "NOOP" }] };
      }
      return {
        state: {
          ...prev,
          context: {
            ...context,
            watchAccumulatedMs: Math.max(0, context.watchAccumulatedMs + event.ms),
          },
        },
        effects: [{ t: "WATCH_EMIT_PROGRESS", reelId: event.reelId, ms: event.ms }],
      };
    }

    case "WATCH_START": {
      return {
        state: {
          ...prev,
          context: {
            ...context,
            watchStartMs: Date.now(),
          },
        },
        effects: [{ t: "WATCH_EMIT_START", reelId: event.reelId }],
      };
    }

    case "WATCH_COMPLETE": {
      return {
        state: prev,
        effects: [{ t: "WATCH_EMIT_COMPLETE", reelId: event.reelId }],
      };
    }

    case "WATCH_STOP": {
      return {
        state: prev,
        effects: [{ t: "WATCH_EMIT_STOP", reelId: event.reelId, reason: event.reason }],
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

    case "LIKE_TOGGLE":
    case "SAVE_TOGGLE":
    case "NETWORK_CHANGED": {
      return { state: prev, effects: [{ t: "NOOP" }] };
    }

    case "CLOSE_REELS": {
      const active = context.activeReelId;
      return {
        state: createInitialReelsState(),
        effects: [
          { t: "PLAYER_DETACH" },
          ...(active ? [{ t: "WATCH_EMIT_STOP", reelId: active, reason: "close" } as const] : []),
          { t: "ROUTE_CLOSE_REELS", reason: event.reason },
        ],
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
        effects: [{ t: "PLAYER_DETACH" }],
      };
    }

    default:
      return { state: prev, effects: [{ t: "NOOP" }] };
  }
}
