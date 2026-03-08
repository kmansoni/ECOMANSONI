/**
 * livestreamStore — Zustand store for livestream UI state.
 *
 * Manages the publisher's current active session, the viewer's
 * watched session, media toggle state, and stream settings.
 * All state transitions are deterministic and side-effect-free.
 */

import { create } from 'zustand';
import type { LiveSession } from '@/types/livestream';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StreamSettings {
  /** Preferred video quality preset. */
  quality: '360p' | '480p' | '720p' | '1080p';
  /** Audio bitrate in kbps. */
  audioBitrate: number;
  /** Video bitrate in kbps. */
  videoBitrate: number;
  /** Target frame rate for the encoder. */
  frameRate: 15 | 24 | 30 | 60;
  /** Whether background blur is enabled (requires WASM support). */
  backgroundBlur: boolean;
  /** Whether noise suppression is enabled. */
  noiseSuppression: boolean;
  /** RTMP/WHIP ingest key id to use when no LiveKit token is provided. */
  activeStreamKeyId: string | null;
}

export interface LivestreamStore {
  // ── State ────────────────────────────────────────────────────────────────

  /** The authenticated user's own active broadcast session (publisher). */
  currentStream: LiveSession | null;
  /** A session the authenticated user is currently watching (viewer). */
  watchingStream: LiveSession | null;

  isMicEnabled: boolean;
  isCameraEnabled: boolean;
  isChatVisible: boolean;
  isFullscreen: boolean;

  streamSettings: StreamSettings;

  // ── Actions ──────────────────────────────────────────────────────────────

  /** Set the publisher's active session. Pass null to clear. */
  setCurrentStream: (session: LiveSession | null) => void;
  /** Set the viewer's watched session. Pass null to stop watching. */
  setWatchingStream: (session: LiveSession | null) => void;

  /** Toggle microphone enabled state. */
  toggleMic: () => void;
  /** Toggle camera enabled state. */
  toggleCamera: () => void;
  /** Toggle chat panel visibility. */
  toggleChat: () => void;
  /** Toggle fullscreen mode. */
  toggleFullscreen: () => void;

  /** Partially update stream encoding / publishing settings. */
  updateStreamSettings: (partial: Partial<StreamSettings>) => void;

  /** Reset entire store to initial values. */
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_SETTINGS: StreamSettings = {
  quality: '720p',
  audioBitrate: 128,
  videoBitrate: 2500,
  frameRate: 30,
  backgroundBlur: false,
  noiseSuppression: true,
  activeStreamKeyId: null,
};

const INITIAL_STATE = {
  currentStream: null,
  watchingStream: null,
  isMicEnabled: true,
  isCameraEnabled: true,
  isChatVisible: true,
  isFullscreen: false,
  streamSettings: DEFAULT_SETTINGS,
} as const;

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

/**
 * Global Zustand store for livestream session and UI state.
 * Consumed by publisher and viewer components alike.
 */
export const useLivestreamStore = create<LivestreamStore>((set) => ({
  ...INITIAL_STATE,

  setCurrentStream: (session) => set({ currentStream: session }),

  setWatchingStream: (session) => set({ watchingStream: session }),

  toggleMic: () => set((s) => ({ isMicEnabled: !s.isMicEnabled })),

  toggleCamera: () => set((s) => ({ isCameraEnabled: !s.isCameraEnabled })),

  toggleChat: () => set((s) => ({ isChatVisible: !s.isChatVisible })),

  toggleFullscreen: () => set((s) => ({ isFullscreen: !s.isFullscreen })),

  updateStreamSettings: (partial) =>
    set((s) => ({ streamSettings: { ...s.streamSettings, ...partial } })),

  reset: () => set({ ...INITIAL_STATE }),
}));
