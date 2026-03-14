/**
 * SFU-only video call hook.
 *
 * Replaces legacy useVideoCall.ts (P2P RTCPeerConnection + Supabase DB signaling).
 * Uses calls-v2 WS + mediasoup-client + E2EE (SFrame).
 *
 * Media path: Browser → mediasoup-client → SFU server → mediasoup-client → Browser
 * Signaling:  WS only (no Supabase DB signaling — DB used only for call history / push notification)
 * E2EE:       ECDH key exchange → SFrame transforms on all media tracks
 *
 * Interface is intentionally compatible with the legacy useVideoCall hook to allow
 * drop-in replacement in VideoCallContext without cascading changes.
 *
 * @see useVideoCall — @deprecated legacy P2P hook (kept for rollback reference)
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getStableCallsDeviceId } from "@/lib/platform/device";
import { logger } from "@/lib/logger";

// Re-use the canonical VideoCall / VideoCallStatus types to stay DB-schema-aligned
// and remain compatible with the rest of the codebase (VideoCallContext, useIncomingCalls, etc.)
export type { VideoCall, VideoCallStatus } from "@/hooks/useVideoCall";
import type { VideoCall, VideoCallStatus } from "@/hooks/useVideoCall";

// ---------------------------------------------------------------------------
// Constraints
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Allowed DB end-call statuses
// ---------------------------------------------------------------------------

/** Allowlist of valid `video_calls.status` values for call termination. */
const VALID_END_STATUSES = ["ended", "declined", "missed"] as const;
type EndCallStatus = typeof VALID_END_STATUSES[number];

function toSafeEndStatus(reason: string): EndCallStatus {
  return (VALID_END_STATUSES as readonly string[]).includes(reason)
    ? (reason as EndCallStatus)
    : "ended";
}

// ---------------------------------------------------------------------------
// Media helpers
// ---------------------------------------------------------------------------

/**
 * Acquire local MediaStream with fail-safe video→audio fallback.
 * Constraints tuned for production quality while allowing degradation
 * under hardware/permission constraints.
 */
async function acquireLocalMedia(isVideo: boolean): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    const unsupported = new Error("MediaDevices API unavailable");
    unsupported.name = "NotSupportedError";
    throw unsupported;
  }

  const baseAudio: MediaTrackConstraints = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  };

  const hdVideo: MediaTrackConstraints = {
    width: { ideal: 1280, max: 1920 },
    height: { ideal: 720, max: 1080 },
    frameRate: { ideal: 30, max: 30 },
  };

  const safeVideo: MediaTrackConstraints = {
    width: { ideal: 640, max: 1280 },
    height: { ideal: 480, max: 720 },
    frameRate: { ideal: 24, max: 30 },
  };

  const isTransientMediaError = (error: unknown): boolean => {
    const name =
      error && typeof error === "object" && "name" in error
        ? String((error as { name?: unknown }).name ?? "")
        : "";
    return name === "AbortError" || name === "NotReadableError" || name === "TrackStartError" || name === "OverconstrainedError";
  };

  const request = async (constraints: MediaStreamConstraints, label: string): Promise<MediaStream> => {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
      if (isTransientMediaError(error)) {
        // Some WebViews/browsers fail the first call right after user clicks "Allow".
        await new Promise((resolve) => window.setTimeout(resolve, 150));
        return navigator.mediaDevices.getUserMedia(constraints);
      }
      console.warn(`[acquireLocalMedia] ${label} failed`, error);
      throw error;
    }
  };

  try {
    if (isVideo) {
      try {
        return await request({ audio: baseAudio, video: hdVideo }, "video+audio(hd)");
      } catch (error) {
        logger.warn("video_call_sfu.acquire_media_hd_failed", { error });
        try {
          return await request({ audio: baseAudio, video: safeVideo }, "video+audio(safe)");
        } catch (safeError) {
          logger.warn("video_call_sfu.acquire_media_safe_failed", { error: safeError });
          // Graceful degradation: keep the call alive in audio-only mode.
          return await request({ audio: baseAudio, video: false }, "audio-only fallback");
        }
      }
    }

    return await request({ audio: baseAudio, video: false }, "audio-only");
  } catch (err) {
    console.error("[acquireLocalMedia] Failed to acquire local media", err);
    throw err;
  }
}

class VideoCallMediaAccessError extends Error {
  public readonly causeName: string;

  constructor(causeName: string, message = "media_access_failed") {
    super(message);
    this.name = "VideoCallMediaAccessError";
    this.causeName = causeName;
  }
}

class VideoCallStartError extends Error {
  public readonly reason: string;
  public readonly details?: unknown;

  constructor(reason: string, details?: unknown, message = "call_start_failed") {
    super(message);
    this.name = "VideoCallStartError";
    this.reason = reason;
    this.details = details;
  }
}

function toMediaAccessError(error: unknown): VideoCallMediaAccessError {
  const causeName =
    error && typeof error === "object" && "name" in error
      ? String((error as { name?: unknown }).name ?? "UnknownError")
      : "UnknownError";
  return new VideoCallMediaAccessError(causeName);
}

function isConnectedCallStatus(status: string | null | undefined): boolean {
  return status === "answered" || status === "active" || status === "connected";
}

function isStatusCompatibilityError(error: unknown): boolean {
  const code = String((error as { code?: unknown } | null)?.code ?? "");
  const message = String((error as { message?: unknown } | null)?.message ?? "").toLowerCase();
  return (
    code === "23514" ||
    code === "PGRST116" ||
    message.includes("check constraint") ||
    message.includes("status")
  );
}

// ---------------------------------------------------------------------------
// Hook return type
// ---------------------------------------------------------------------------

export interface UseVideoCallSfuReturn {
  /** Subset of VideoCallStatus. Mirrors legacy hook's `status`. */
  status: VideoCallStatus;
  currentCall: VideoCall | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  /**
   * Expose setter so VideoCallContext (SfuMediaManager owner) can push
   * aggregated remote tracks into this hook's state when consumers are created.
   * Called with a new MediaStream built from SfuMediaManager.getAllRemoteTracks().
   */
  setRemoteStream: (stream: MediaStream | null) => void;
  /** true = mic muted. Mirrors legacy hook's `isMuted`. */
  isMuted: boolean;
  /** true = camera off. Mirrors legacy hook's `isVideoOff`. */
  isVideoOff: boolean;
  /**
   * Connection quality descriptor.
   * Mirrors legacy hook's `connectionState` string slot.
   * Values: 'good' | 'fair' | 'poor' | 'unknown' | 'connected' | 'failed'
   */
  connectionState: string;
  /**
   * Start outgoing call.
   * - Acquires local media
   * - Creates DB call record (for push notification + call history)
   * - Returns the created VideoCall for caller-side SFU room bootstrap
   */
  startCall: (
    calleeId: string,
    conversationId: string | null,
    callType: "video" | "audio"
  ) => Promise<VideoCall | null>;
  /**
   * Answer incoming call.
   * - Acquires local media
   * - Updates call status in DB
   */
  answerCall: (call: VideoCall) => Promise<void>;
  /**
   * End active call.
   * Updates DB status; media cleanup happens in caller.
   */
  endCall: (reason?: string) => Promise<void>;
  toggleMute: () => void;
  toggleVideo: () => void;
  /**
   * No-op stub — P2P credential refresh concept does not apply in SFU mode.
   * Preserved for interface compatibility; callers can safely await it.
   */
  retryWithFreshCredentials: () => Promise<void>;
  /**
   * Marks media bootstrap as failed so UI can exit endless "connecting" state.
   */
  markMediaBootstrapFailed: (reason?: string, details?: unknown) => void;
  /**
   * Notifies hook about successful media bootstrap milestones (e.g. transports created).
   */
  markMediaBootstrapProgress: (signal: "send_transport_created" | "recv_transport_created") => void;
}

// ---------------------------------------------------------------------------
// Hook options
// ---------------------------------------------------------------------------

export interface UseVideoCallSfuOptions {
  /** Called when the current call transitions to ended/failed state. */
  onCallEnded?: (call: VideoCall) => void;
}

// ---------------------------------------------------------------------------
// useVideoCallSfu
// ---------------------------------------------------------------------------

export function useVideoCallSfu(options: UseVideoCallSfuOptions = {}): UseVideoCallSfuReturn {
  const { user } = useAuth();
  const onCallEndedRef = useRef(options.onCallEnded);
  useEffect(() => {
    onCallEndedRef.current = options.onCallEnded;
  });

  const [status, setStatus] = useState<VideoCallStatus>("idle");
  const [currentCall, setCurrentCall] = useState<VideoCall | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreamState, setRemoteStreamState] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [connectionState, setConnectionState] = useState<string>("unknown");

  const localStreamRef = useRef<MediaStream | null>(null);
  const currentCallRef = useRef<VideoCall | null>(null);
  const mediaBootstrapSignalsRef = useRef<Set<string>>(new Set());

  // Keep refs in sync for use inside callbacks
  useEffect(() => { localStreamRef.current = localStream; }, [localStream]);
  useEffect(() => { currentCallRef.current = currentCall; }, [currentCall]);

  const setRemoteStream = useCallback((stream: MediaStream | null) => {
    setRemoteStreamState(stream);

    const hasLiveRemoteTracks = !!stream && stream.getTracks().some((track) => track.readyState === "live");
    logger.info("video_call_sfu.remote_stream_updated", {
      hasLiveRemoteTracks,
      trackCount: stream?.getTracks().length ?? 0,
    });
    if (hasLiveRemoteTracks) {
      setStatus((prev) => (prev === "idle" ? prev : "connected"));
      setConnectionState("connected");
      logger.info("video_call_sfu.connection_promoted_by_remote_tracks", {});
    }
  }, []);

  const markMediaBootstrapFailed = useCallback((reason = "media_bootstrap_failed", details?: unknown) => {
    console.error("[useVideoCallSfu] markMediaBootstrapFailed:", reason, details);
    setConnectionState("failed");
    setStatus((prev) => (prev === "idle" ? prev : "connected"));
  }, []);

  const markMediaBootstrapProgress = useCallback((signal: "send_transport_created" | "recv_transport_created") => {
    mediaBootstrapSignalsRef.current.add(signal);
    logger.info("video_call_sfu.media_bootstrap_progress", { signal });
  }, []);

  useEffect(() => {
    if (status !== "connected") return;
    if (connectionState === "connected" || connectionState === "failed") return;

    // SFU media may arrive later than signaling. Promote state after grace period
    // so UI does not stay forever in "connecting".
    logger.info("video_call_sfu.fallback_timer_started", { connectionState });
    const timer = window.setTimeout(() => {
      setConnectionState((prev) => {
        if (prev === "failed") return prev;
        const hasSend = mediaBootstrapSignalsRef.current.has("send_transport_created");
        const hasRecv = mediaBootstrapSignalsRef.current.has("recv_transport_created");
        if (!hasSend || !hasRecv) {
          console.warn("[useVideoCallSfu] 3500ms fallback skipped: missing media bootstrap signals", {
            hasSend,
            hasRecv,
          });
          return prev;
        }
        logger.info("video_call_sfu.fallback_promoted_connected", { previousState: prev });
        return "connected";
      });
    }, 3500);

    return () => {
      window.clearTimeout(timer);
    };
  }, [status, connectionState]);

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  const releaseLocalMedia = useCallback(() => {
    const stream = localStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setLocalStream(null);
      localStreamRef.current = null;
    }
  }, []);

  const resetState = useCallback(() => {
    releaseLocalMedia();
    setRemoteStreamState(null);
    mediaBootstrapSignalsRef.current.clear();
    setStatus("idle");
    setConnectionState("unknown");
    setIsMuted(false);
    setIsVideoOff(false);
    // Note: setCurrentCall(null) must be called after onCallEnded fires — see endCall
  }, [releaseLocalMedia]);

  // ---------------------------------------------------------------------------
  // startCall
  // ---------------------------------------------------------------------------

  const startCall = useCallback(async (
    calleeId: string,
    conversationId: string | null,
    callType: "video" | "audio"
  ): Promise<VideoCall | null> => {
    if (!user?.id) {
      console.error("[useVideoCallSfu] startCall: not authenticated");
      return null;
    }
    if (currentCallRef.current) {
      console.warn("[useVideoCallSfu] startCall: already in a call");
      return null;
    }

    const isVideo = callType === "video";

    // Acquire media BEFORE writing to DB — fail fast if permissions denied
    let stream: MediaStream;
    try {
      stream = await acquireLocalMedia(isVideo);
    } catch (err) {
      console.error("[useVideoCallSfu] startCall: media acquisition failed", err);
      throw toMediaAccessError(err);
    }

    setLocalStream(stream);
    setStatus("calling");

    // Persist call record — used for push notification routing and call history.
    // NOTE: SFU signaling does NOT go through DB — only WS.
    const callId = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    const { error } = await supabase
      .from("video_calls")
      .insert({
        id: callId,
        caller_id: user.id,
        callee_id: calleeId,
        conversation_id: conversationId,
        call_type: callType,
        status: "ringing",
        created_at: createdAt,
      });

    if (error) {
      console.error("[useVideoCallSfu] startCall: DB insert failed", error);
      releaseLocalMedia();
      setStatus("idle");
      throw new VideoCallStartError("db_insert_failed", error);
    }

    const call: VideoCall = {
      id: callId,
      caller_id: user.id,
      callee_id: calleeId,
      conversation_id: conversationId,
      call_type: callType,
      status: "ringing",
      created_at: createdAt,
      started_at: null,
      ended_at: null,
    };
    setCurrentCall(call);
    mediaBootstrapSignalsRef.current.clear();
    setConnectionState("connecting");
    logger.info("video_call_sfu.start_call_connecting", { callId: call.id.slice(0, 8) });
    return call;
  }, [user, releaseLocalMedia]);

  // ---------------------------------------------------------------------------
  // answerCall
  // ---------------------------------------------------------------------------

  const answerCall = useCallback(async (call: VideoCall): Promise<void> => {
    if (!user?.id) throw new Error("[useVideoCallSfu] answerCall: not authenticated");
    if (currentCallRef.current) throw new Error("[useVideoCallSfu] answerCall: already in a call");

    const isVideo = call.call_type === "video";

    let stream: MediaStream;
    try {
      stream = await acquireLocalMedia(isVideo);
    } catch (err) {
      console.error("[useVideoCallSfu] answerCall: media acquisition failed", err);
      throw toMediaAccessError(err);
    }

    setLocalStream(stream);

    // Update DB status — callee acknowledged.
    // Compatibility: some environments still use `active` instead of `answered`.
    const { error: answerError } = await supabase
      .from("video_calls")
      .update({
        status: "answered",
        started_at: new Date().toISOString(),
      })
      .eq("id", call.id);

    if (answerError) {
      if (isStatusCompatibilityError(answerError)) {
        const { error: fallbackError } = await supabase
          .from("video_calls")
          .update({
            status: "active",
            started_at: new Date().toISOString(),
          })
          .eq("id", call.id);

        if (fallbackError) {
          releaseLocalMedia();
          setStatus("idle");
          throw new VideoCallStartError("db_answer_update_failed", fallbackError);
        }
      } else {
        releaseLocalMedia();
        setStatus("idle");
        throw new VideoCallStartError("db_answer_update_failed", answerError);
      }
    }

    const answeredCall: VideoCall = { ...call, status: "answered" };
    setCurrentCall(answeredCall);
    mediaBootstrapSignalsRef.current.clear();
    setStatus("connected");
    // Keep call active, but do not report final media connectivity before SFU bootstrap succeeds.
    setConnectionState("connecting");
    logger.info("video_call_sfu.answer_call_connecting", { callId: call.id.slice(0, 8) });
  }, [releaseLocalMedia, user]);

  const applyCallRowUpdate = useCallback((updated: VideoCall) => {
    if (!updated || !updated.id) return;

    const active = currentCallRef.current;
    if (!active || active.id !== updated.id) return;

    setCurrentCall(updated);

    if (isConnectedCallStatus(updated.status)) {
      setStatus("connected");
      // DB status can become "answered" before media transport is actually ready.
      // Keep connecting state until remote tracks arrive or fallback timer promotes it.
      setConnectionState((prev) => {
        if (prev === "failed" || prev === "connected") return prev;
        return "connecting";
      });
      return;
    }

    if (["declined", "ended", "missed"].includes(updated.status)) {
      onCallEndedRef.current?.(updated);
      setStatus("ended");
      setCurrentCall(null);
      resetState();
    }
  }, [resetState]);

  useEffect(() => {
    if (!currentCall?.id || !user?.id) return;

    const activeCallId = currentCall.id;

    const channel = supabase
      .channel(`video-call-state-${activeCallId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "video_calls",
          filter: `id=eq.${activeCallId}`,
        },
        (payload) => {
          const updated = payload.new as VideoCall;
          if (!updated || updated.id !== activeCallId) return;
          applyCallRowUpdate(updated);
        }
      )
      .subscribe();

    // Fallback reconciliation in case Realtime event is dropped or delayed.
    const pollTimer = window.setInterval(() => {
      const active = currentCallRef.current;
      if (!active || active.id !== activeCallId) return;

      void (async () => {
        const { data } = await supabase
          .from("video_calls" as never)
          .select("*" as never)
          .eq("id", activeCallId)
          .maybeSingle();

        if (data && typeof data === "object") {
          applyCallRowUpdate(data as VideoCall);
        }
      })();
    }, 1500);

    return () => {
      window.clearInterval(pollTimer);
      supabase.removeChannel(channel);
    };
  }, [applyCallRowUpdate, currentCall?.id, user?.id]);

  // ---------------------------------------------------------------------------
  // endCall
  // ---------------------------------------------------------------------------

  const endCall = useCallback(async (reason = "ended"): Promise<void> => {
    const call = currentCallRef.current;

    if (call) {
      try {
        const { error } = await supabase
          .from("video_calls")
          .update({
            status: toSafeEndStatus(reason),  // validate against allowlist before writing to DB
            ended_at: new Date().toISOString(),
          })
          .eq("id", call.id);
        if (error) {
          console.error("[useVideoCallSfu] endCall: DB update returned error", error);
        }
      } catch (e) {
        console.error("[useVideoCallSfu] endCall: DB update failed", e);
      }
      onCallEndedRef.current?.(call);
    }

    setStatus("ended");
    setCurrentCall(null);
    resetState();
  }, [resetState]);

  // ---------------------------------------------------------------------------
  // toggleMute / toggleVideo
  // ---------------------------------------------------------------------------

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getAudioTracks().forEach((t) => {
      t.enabled = !t.enabled;
    });
    setIsMuted((prev) => !prev);
  }, []);

  const toggleVideo = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getVideoTracks().forEach((t) => {
      t.enabled = !t.enabled;
    });
    setIsVideoOff((prev) => !prev);
  }, []);

  // ---------------------------------------------------------------------------
  // retryWithFreshCredentials — no-op stub (P2P ICE concept, not applicable here)
  // ---------------------------------------------------------------------------

  const retryWithFreshCredentials = useCallback(async (): Promise<void> => {
    logger.info("video_call_sfu.retry_noop", {
      reason: "SFU mode — no ICE renegotiation needed; reconnect via WS",
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Cleanup on unmount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    return () => {
      releaseLocalMedia();
    };
  }, [releaseLocalMedia]);

  return {
    status,
    currentCall,
    localStream,
    remoteStream: remoteStreamState,
    setRemoteStream,
    isMuted,
    isVideoOff,
    connectionState,
    startCall,
    answerCall,
    endCall,
    toggleMute,
    toggleVideo,
    retryWithFreshCredentials,
    markMediaBootstrapFailed,
    markMediaBootstrapProgress,
  };
}
