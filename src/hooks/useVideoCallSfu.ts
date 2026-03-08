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
const VALID_END_STATUSES = ["ended", "declined", "missed", "failed", "busy"] as const;
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
      } catch {
        try {
          return await request({ audio: baseAudio, video: safeVideo }, "video+audio(safe)");
        } catch {
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
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [connectionState, setConnectionState] = useState<string>("unknown");

  const localStreamRef = useRef<MediaStream | null>(null);
  const currentCallRef = useRef<VideoCall | null>(null);

  // Keep refs in sync for use inside callbacks
  useEffect(() => { localStreamRef.current = localStream; }, [localStream]);
  useEffect(() => { currentCallRef.current = currentCall; }, [currentCall]);

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
    setConnectionState("good");
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

    // Update DB status — callee acknowledged
    const { error: answerError } = await supabase
      .from("video_calls")
      .update({
        status: "connected",
        started_at: new Date().toISOString(),
      })
      .eq("id", call.id);

    if (answerError) {
      releaseLocalMedia();
      setStatus("idle");
      throw new VideoCallStartError("db_answer_update_failed", answerError);
    }

    const answeredCall: VideoCall = { ...call, status: "connected" };
    setCurrentCall(answeredCall);
    setStatus("connected");
    setConnectionState("good");
  }, [user]);

  // ---------------------------------------------------------------------------
  // endCall
  // ---------------------------------------------------------------------------

  const endCall = useCallback(async (reason = "ended"): Promise<void> => {
    const call = currentCallRef.current;

    if (call) {
      try {
        await supabase
          .from("video_calls")
          .update({
            status: toSafeEndStatus(reason),  // validate against allowlist before writing to DB
            ended_at: new Date().toISOString(),
          })
          .eq("id", call.id);
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
    console.info("[useVideoCallSfu] retryWithFreshCredentials: SFU mode — no ICE renegotiation needed; reconnect via WS");
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
    remoteStream,
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
  };
}
