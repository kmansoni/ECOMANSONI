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
import { acquireScreenStream } from "@/lib/calls/screenShare";
import { NoiseSuppressor } from "@/lib/audio/noiseSuppression";
import { VideoBlurProcessor } from "@/lib/calls/videoBlurProcessor";

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
      logger.warn("video_call_sfu.acquire_local_media_failed", { label, error });
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
    logger.error("video_call_sfu.acquire_local_media_all_failed", { error: err });
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
  /**
   * Release acquired local media without updating the DB call status.
   * Used when handing off to the legacy P2P engine on SFU bootstrap failure.
   */
  releaseMediaWithoutDbUpdate: () => void;
  /** Screen share: флаг активности демонстрации экрана. */
  isScreenSharing: boolean;
  /** Screen share: текущий MediaStream экрана (null если не активен). */
  screenStream: MediaStream | null;
  /** Screen share: начать демонстрацию экрана. */
  startScreenShare: () => Promise<void>;
  /** Screen share: остановить демонстрацию экрана. */
  stopScreenShare: () => void;
  /** Noise suppression: флаг активности шумоподавления. */
  noiseSuppressionEnabled: boolean;
  /** Noise suppression: переключить шумоподавление. */
  toggleNoiseSuppression: () => Promise<void>;
  /** Background blur: флаг активности размытия фона. */
  backgroundBlurEnabled: boolean;
  /** Background blur: переключить размытие фона. */
  toggleBackgroundBlur: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Hook options
// ---------------------------------------------------------------------------

export interface UseVideoCallSfuOptions {
  /** Called when the current call transitions to ended/failed state. */
  onCallEnded?: (call: VideoCall) => void;
}

function normalizeRealtimeCallRow(value: unknown): VideoCall | null {
  if (!value || typeof value !== "object") return null;

  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string") return null;

  return {
    ...(row as unknown as VideoCall),
    status: (row.state ?? row.status) as VideoCall["status"],
  };
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

  // Screen share state
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);

  // Noise suppression state
  const [noiseSuppressionEnabled, setNoiseSuppressionEnabled] = useState(false);
  const noiseSuppressorRef = useRef<NoiseSuppressor | null>(null);
  const originalAudioTrackRef = useRef<MediaStreamTrack | null>(null);

  // Background blur state
  const [backgroundBlurEnabled, setBackgroundBlurEnabled] = useState(false);
  const blurProcessorRef = useRef<VideoBlurProcessor | null>(null);
  const originalVideoTrackRef = useRef<MediaStreamTrack | null>(null);

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
    logger.error("video_call_sfu.media_bootstrap_failed", { reason, details });
    setConnectionState("failed");
    // Do NOT touch status here. status tracks DB/call lifecycle (idle/calling/ringing/connected/ended)
    // and must not be artificially promoted to "connected" on a media failure.
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
          logger.warn("video_call_sfu.fallback_skipped_missing_signals", {
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

  const stopScreenShare = useCallback(() => {
    const stream = screenStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
      setScreenStream(null);
    }
    setIsScreenSharing(false);
  }, []);

  const cleanupProcessors = useCallback(() => {
    noiseSuppressorRef.current?.close();
    noiseSuppressorRef.current = null;
    originalAudioTrackRef.current = null;
    setNoiseSuppressionEnabled(false);

    blurProcessorRef.current?.stop();
    blurProcessorRef.current = null;
    originalVideoTrackRef.current = null;
    setBackgroundBlurEnabled(false);
  }, []);

  const releaseMediaWithoutDbUpdate = useCallback(() => {
    releaseLocalMedia();
    stopScreenShare();
    cleanupProcessors();
    setRemoteStreamState(null);
    mediaBootstrapSignalsRef.current.clear();
    setConnectionState("unknown");
    logger.info("video_call_sfu.media_released_for_engine_handoff", {});
  }, [releaseLocalMedia, stopScreenShare, cleanupProcessors]);

  const resetState = useCallback(() => {
    releaseLocalMedia();
    stopScreenShare();
    cleanupProcessors();
    setRemoteStreamState(null);
    mediaBootstrapSignalsRef.current.clear();
    setStatus("idle");
    setConnectionState("unknown");
    setIsMuted(false);
    setIsVideoOff(false);
    // Note: setCurrentCall(null) must be called after onCallEnded fires — see endCall
  }, [releaseLocalMedia, stopScreenShare, cleanupProcessors]);

  // ---------------------------------------------------------------------------
  // startCall
  // ---------------------------------------------------------------------------

  const startCall = useCallback(async (
    calleeId: string,
    conversationId: string | null,
    callType: "video" | "audio"
  ): Promise<VideoCall | null> => {
    if (!user?.id) {
      logger.error("video_call_sfu.start_call_not_authenticated", {});
      return null;
    }
    if (currentCallRef.current) {
      logger.warn("video_call_sfu.start_call_already_in_call", {});
      return null;
    }

    const isVideo = callType === "video";

    // Acquire media BEFORE writing to DB — fail fast if permissions denied
    let stream: MediaStream;
    try {
      stream = await acquireLocalMedia(isVideo);
    } catch (err) {
      logger.error("video_call_sfu.start_call_media_failed", { error: err });
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
      logger.error("video_call_sfu.start_call_db_insert_failed", { error });
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
      logger.error("video_call_sfu.answer_call_media_failed", { error: err });
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

    // Always sync call metadata (participants, timestamps, call_type, etc.)
    setCurrentCall(updated);

    // Terminal states from DB are authoritative — honour unconditionally.
    if (["declined", "ended", "missed"].includes(updated.status)) {
      onCallEndedRef.current?.(updated);
      setStatus("ended");
      setCurrentCall(null);
      resetState();
      return;
    }

    // For connected call statuses (answered/active/connected):
    // Only advance status forward (calling/ringing → connected).
    // Never regress from ended/idle and never override media-driven connectionState.
    if (isConnectedCallStatus(updated.status)) {
      setStatus((prev) => {
        if (prev === "calling" || prev === "ringing") return "connected";
        return prev; // already connected or terminal — no-op
      });
      // connectionState is exclusively managed by WS / media events
      // (setRemoteStream, markMediaBootstrapFailed, fallback timer).
      // DB must not touch it.
      return;
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
          table: "calls",
          filter: `id=eq.${activeCallId}`,
        },
        (payload) => {
          const updated = normalizeRealtimeCallRow(payload.new);
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
          logger.error("video_call_sfu.end_call_db_update_error", { error });
        }
      } catch (e) {
        logger.error("video_call_sfu.end_call_db_update_failed", { error: e });
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
  // Screen share / Noise suppression / Background blur
  // ---------------------------------------------------------------------------

  const startScreenShare = useCallback(async () => {
    if (screenStreamRef.current) return;
    try {
      const stream = await acquireScreenStream();
      screenStreamRef.current = stream;
      setScreenStream(stream);
      setIsScreenSharing(true);

      // Auto-stop: пользователь нажал "Прекратить демонстрацию" в браузере
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.addEventListener('ended', () => {
          stopScreenShare();
        }, { once: true });
      }

      logger.info('video_call_sfu.screen_share_started', {});
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'NotAllowedError') return;
      logger.error('video_call_sfu.screen_share_failed', { error });
    }
  }, [stopScreenShare]);

  const toggleNoiseSuppression = useCallback(async () => {
    const stream = localStreamRef.current;
    if (!stream) return;

    try {
      if (noiseSuppressorRef.current) {
        // Выключаем: вернуть оригинальный трек
        noiseSuppressorRef.current.close();
        noiseSuppressorRef.current = null;

        const originalTrack = originalAudioTrackRef.current;
        if (originalTrack && originalTrack.readyState === 'live') {
          const currentAudio = stream.getAudioTracks()[0];
          if (currentAudio) stream.removeTrack(currentAudio);
          stream.addTrack(originalTrack);
        }
        originalAudioTrackRef.current = null;
        setNoiseSuppressionEnabled(false);
        logger.info('video_call_sfu.noise_suppression_disabled', {});
      } else {
        // Включаем: процессинг аудио
        const audioTrack = stream.getAudioTracks()[0];
        if (!audioTrack) return;

        originalAudioTrackRef.current = audioTrack;
        const audioStream = new MediaStream([audioTrack]);
        const suppressor = new NoiseSuppressor(audioStream);
        noiseSuppressorRef.current = suppressor;

        const processedStream = suppressor.getProcessedStream();
        if (!processedStream) {
          suppressor.close();
          noiseSuppressorRef.current = null;
          originalAudioTrackRef.current = null;
          return;
        }

        const processedTrack = processedStream.getAudioTracks()[0];
        if (processedTrack) {
          stream.removeTrack(audioTrack);
          stream.addTrack(processedTrack);
        }
        setNoiseSuppressionEnabled(true);
        logger.info('video_call_sfu.noise_suppression_enabled', {});
      }
    } catch (error) {
      logger.error('video_call_sfu.noise_suppression_toggle_failed', { error });
    }
  }, []);

  const toggleBackgroundBlur = useCallback(async () => {
    const stream = localStreamRef.current;
    if (!stream) return;

    try {
      if (blurProcessorRef.current) {
        // Выключаем: вернуть оригинальный трек
        blurProcessorRef.current.stop();
        blurProcessorRef.current = null;

        const originalTrack = originalVideoTrackRef.current;
        if (originalTrack && originalTrack.readyState === 'live') {
          const currentVideo = stream.getVideoTracks()[0];
          if (currentVideo) stream.removeTrack(currentVideo);
          stream.addTrack(originalTrack);
        }
        originalVideoTrackRef.current = null;
        setBackgroundBlurEnabled(false);
        logger.info('video_call_sfu.background_blur_disabled', {});
      } else {
        // Включаем: процессинг видео
        const videoTrack = stream.getVideoTracks()[0];
        if (!videoTrack) return;

        originalVideoTrackRef.current = videoTrack;
        const processor = new VideoBlurProcessor();
        blurProcessorRef.current = processor;

        const processedTrack = await processor.start(videoTrack);
        stream.removeTrack(videoTrack);
        stream.addTrack(processedTrack);
        setBackgroundBlurEnabled(true);
        logger.info('video_call_sfu.background_blur_enabled', {});
      }
    } catch (error) {
      logger.error('video_call_sfu.background_blur_toggle_failed', { error });
      blurProcessorRef.current?.stop();
      blurProcessorRef.current = null;
      originalVideoTrackRef.current = null;
    }
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
      stopScreenShare();
      cleanupProcessors();
    };
  }, [releaseLocalMedia, stopScreenShare, cleanupProcessors]);

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
    releaseMediaWithoutDbUpdate,
    // Screen share
    isScreenSharing,
    screenStream,
    startScreenShare,
    stopScreenShare,
    // Noise suppression
    noiseSuppressionEnabled,
    toggleNoiseSuppression,
    // Background blur
    backgroundBlurEnabled,
    toggleBackgroundBlur,
  };
}
