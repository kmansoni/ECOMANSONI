import { createContext, useContext, ReactNode, useState, useCallback, useEffect, useRef } from "react";
import { useVideoCall, type VideoCall, type VideoCallStatus } from "@/hooks/useVideoCall";
import { useIncomingCalls } from "@/hooks/useIncomingCalls";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { onNativeCallAction } from "@/lib/native/callBridge";
import { supabase } from "@/integrations/supabase/client";
import { CallsWsClient } from "@/calls-v2/wsClient";

const CALLS_V2_ENABLED = import.meta.env.VITE_CALLS_V2_ENABLED === "true";
const CALLS_V2_WS_URL = (import.meta.env.VITE_CALLS_V2_WS_URL ?? "").trim();
const CALLS_V2_WS_URLS = (import.meta.env.VITE_CALLS_V2_WS_URLS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const REKEY_INTERVAL_MS = Math.max(30_000, Number(import.meta.env.VITE_CALLS_V2_REKEY_INTERVAL_MS ?? "120000"));
const FRAME_E2EE_ADVERTISE_SFRAME = import.meta.env.VITE_CALLS_FRAME_E2EE_ADVERTISE_SFRAME === "true";

function hasInsertableStreamsSupport(): boolean {
  try {
    return typeof RTCRtpSender !== "undefined" && "createEncodedStreams" in RTCRtpSender.prototype;
  } catch {
    return false;
  }
}

function getStableCallsDeviceId(): string {
  const key = "mansoni_calls_v2_device_id";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const created = globalThis.crypto?.randomUUID?.() ?? `dev_${Date.now()}`;
  window.localStorage.setItem(key, created);
  return created;
}

interface VideoCallContextType {
  // State
  status: VideoCallStatus;
  currentCall: VideoCall | null;
  incomingCall: VideoCall | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isVideoOff: boolean;
  connectionState: string;
  isCallUiActive: boolean; // UI-lock flag to persist through permission prompts
  
  // Actions
  startCall: (calleeId: string, conversationId: string | null, callType: "video" | "audio") => Promise<VideoCall | null>;
  answerCall: (call: VideoCall) => Promise<void>;
  declineCall: () => Promise<void>;
  endCall: () => Promise<void>;
  toggleMute: () => void;
  toggleVideo: () => void;
  retryConnection: () => Promise<void>;
}

const VideoCallContext = createContext<VideoCallContextType | null>(null);

export function VideoCallProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [pendingIncomingCall, setPendingIncomingCall] = useState<VideoCall | null>(null);
  const callsWsRef = useRef<CallsWsClient | null>(null);
  const callsWsRoomRef = useRef<string | null>(null);
  const callsWsMediaRoomRef = useRef<string | null>(null);
  const callsWsSendTransportRef = useRef<string | null>(null);
  const callsWsRecvTransportRef = useRef<string | null>(null);
  const rekeyTimerRef = useRef<number | null>(null);
  const e2eeEpochRef = useRef<number>(0);
  
  // UI-lock: keeps call UI visible even during transient status changes (permission prompts, etc.)
  const [isCallUiActive, setIsCallUiActive] = useState(false);
  const isCallUiActiveRef = useRef(false);
  
  // Sync ref with state for callbacks
  useEffect(() => {
    isCallUiActiveRef.current = isCallUiActive;
  }, [isCallUiActive]);

  const {
    status,
    currentCall,
    localStream,
    remoteStream,
    isMuted,
    isVideoOff,
    connectionState,
    startCall: startVideoCall,
    answerCall: answerVideoCall,
    endCall: endVideoCall,
    toggleMute,
    toggleVideo,
    retryWithFreshCredentials,
  } = useVideoCall({
    onCallEnded: (call) => {
      console.log("[VideoCallContext] Call ended:", call.id.slice(0, 8));
      if (callsWsRoomRef.current === call.id) {
        callsWsRoomRef.current = null;
      }
      setPendingIncomingCall(null);
      setIsCallUiActive(false); // Release UI-lock on call end
    },
  });

  const closeCallsV2 = useCallback(() => {
    if (rekeyTimerRef.current) {
      window.clearInterval(rekeyTimerRef.current);
      rekeyTimerRef.current = null;
    }
    if (!callsWsRef.current) return;
    callsWsRef.current.close();
    callsWsRef.current = null;
    callsWsRoomRef.current = null;
    callsWsMediaRoomRef.current = null;
    callsWsSendTransportRef.current = null;
    callsWsRecvTransportRef.current = null;
  }, []);

  const ensureCallsV2Connected = useCallback(async (): Promise<CallsWsClient | null> => {
    if (!CALLS_V2_ENABLED || !CALLS_V2_WS_URL || !user) return null;
    if (callsWsRef.current) return callsWsRef.current;

    const endpoints = CALLS_V2_WS_URLS.length > 0 ? CALLS_V2_WS_URLS : (CALLS_V2_WS_URL ? [CALLS_V2_WS_URL] : []);
    const client = new CallsWsClient({
      url: endpoints[0],
      urls: endpoints,
      heartbeatMs: 10_000,
      reconnect: { enabled: true, maxAttempts: 20, baseDelayMs: 500, maxDelayMs: 12_000 },
      ackRetry: { maxRetries: 1, retryDelayMs: 250 },
    });

    try {
      await client.connect();

      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) {
        client.close();
        return null;
      }

      const deviceId = getStableCallsDeviceId();
      await client.hello({
        client: {
          platform: "web",
          appVersion: "calls-v2-bootstrap",
          deviceId,
        },
      });
      await client.auth({ accessToken });
      await client.e2eeCaps({
        insertableStreams: hasInsertableStreamsSupport(),
        sframe: FRAME_E2EE_ADVERTISE_SFRAME && hasInsertableStreamsSupport(),
      });

      client.on("REKEY_COMMIT", (frame) => {
        const epochRaw = frame.payload?.epoch;
        const nextEpoch = typeof epochRaw === "number" ? epochRaw : Number(epochRaw);
        if (!Number.isFinite(nextEpoch)) return;
        // Desync guard: never move backward.
        if (nextEpoch > e2eeEpochRef.current) {
          e2eeEpochRef.current = nextEpoch;
          const activeRoomId = callsWsRoomRef.current;
          if (activeRoomId) {
            void client.e2eeReady({ roomId: activeRoomId, epoch: nextEpoch }).catch((err) => {
              console.warn("[VideoCallContext] E2EE_READY after REKEY_COMMIT failed", err);
            });
          }
        }
      });

      callsWsRef.current = client;
      return client;
    } catch (err) {
      console.warn("[VideoCallContext] calls-v2 connect/bootstrap failed", err);
      client.close();
      return null;
    }
  }, [user]);

  const bootstrapCallsV2Room = useCallback(
    async (call: VideoCall, role: "caller" | "callee") => {
      if (!CALLS_V2_ENABLED || !CALLS_V2_WS_URL || !user) return;

      const roomId = call.id;
      if (callsWsRoomRef.current === roomId) return;

      const client = await ensureCallsV2Connected();
      if (!client) return;

      try {
        if (role === "caller") {
          await client.roomCreate({
            roomId,
            callId: call.id,
            preferredRegion: "tr",
          });
        }

        await client.roomJoin({
          roomId,
          callId: call.id,
          deviceId: getStableCallsDeviceId(),
          preferredRegion: "tr",
        });
        e2eeEpochRef.current = 0;
        await client.e2eeReady({ roomId, epoch: 0 });

        const consumeUnsub = client.on("PRODUCER_ADDED", (frame) => {
          if (frame.payload?.roomId !== roomId) return;
          const producerId = frame.payload?.producerId as string | undefined;
          if (!producerId) return;
          void client.consume({ roomId, producerId, mode: "low-latency" }).catch((err) => {
            console.warn("[VideoCallContext] calls-v2 consume failed", err);
          });
        });

        setTimeout(() => {
          consumeUnsub();
        }, 10 * 60_000);

        callsWsRoomRef.current = roomId;

        if (rekeyTimerRef.current) {
          window.clearInterval(rekeyTimerRef.current);
          rekeyTimerRef.current = null;
        }

        rekeyTimerRef.current = window.setInterval(() => {
          const activeClient = callsWsRef.current;
          const activeRoomId = callsWsRoomRef.current;
          if (!activeClient || !activeRoomId) return;

          const nextEpoch = e2eeEpochRef.current + 1;
          void activeClient
            .rekeyBegin({ roomId: activeRoomId, epoch: nextEpoch })
            .then(() => activeClient.rekeyCommit({ roomId: activeRoomId, epoch: nextEpoch }))
            .then(() => activeClient.e2eeReady({ roomId: activeRoomId, epoch: nextEpoch }))
            .then(() => {
              if (nextEpoch > e2eeEpochRef.current) {
                e2eeEpochRef.current = nextEpoch;
              }
            })
            .catch((error) => {
              console.warn("[VideoCallContext] periodic rekey failed", error);
            });
        }, REKEY_INTERVAL_MS);
      } catch (err) {
        console.warn("[VideoCallContext] calls-v2 room bootstrap failed", err);
      }
    },
    [ensureCallsV2Connected, user]
  );

  const bootstrapCallsV2Media = useCallback(
    async (call: VideoCall, stream: MediaStream | null) => {
      if (!CALLS_V2_ENABLED || !CALLS_V2_WS_URL || !user || !stream) return;
      const roomId = call.id;

      if (callsWsRoomRef.current !== roomId) return;
      if (callsWsMediaRoomRef.current === roomId) return;

      const client = callsWsRef.current ?? (await ensureCallsV2Connected());
      if (!client) return;

      try {
        await client.transportCreate({ roomId, direction: "send" });
        const sendCreated = await client.waitFor(
          "TRANSPORT_CREATED",
          (frame) => frame.payload?.roomId === roomId && frame.payload?.direction === "send",
          { timeoutMs: 5000, acceptRecent: true }
        );
        const sendTransportId = sendCreated.payload?.transportId as string | undefined;
        if (!sendTransportId) return;

        await client.transportCreate({ roomId, direction: "recv" });
        const recvCreated = await client.waitFor(
          "TRANSPORT_CREATED",
          (frame) => frame.payload?.roomId === roomId && frame.payload?.direction === "recv",
          { timeoutMs: 5000, acceptRecent: true }
        );
        const recvTransportId = recvCreated.payload?.transportId as string | undefined;
        if (!recvTransportId) return;

        await client.transportConnect({ roomId, transportId: sendTransportId, dtlsParameters: {} });
        await client.transportConnect({ roomId, transportId: recvTransportId, dtlsParameters: {} });

        callsWsSendTransportRef.current = sendTransportId;
        callsWsRecvTransportRef.current = recvTransportId;

        const tracks = stream.getTracks().filter((track) => track.readyState === "live");
        for (const track of tracks) {
          const kind = track.kind === "audio" ? "audio" : "video";
          await client.produce({
            roomId,
            transportId: sendTransportId,
            kind,
            rtpParameters: {},
            appData: { trackId: track.id },
          });
        }

        callsWsMediaRoomRef.current = roomId;
      } catch (err) {
        console.warn("[VideoCallContext] calls-v2 media bootstrap failed", err);
      }
    },
    [ensureCallsV2Connected, user]
  );

  const { incomingCall: detectedIncomingCall, clearIncomingCall } = useIncomingCalls({
    onIncomingCall: (call) => {
      // Don't show incoming call if we're already in a call or UI-lock is active
      if (status !== "idle" || isCallUiActiveRef.current) {
        console.log("[VideoCallContext] Already in call or UI active, ignoring incoming");
        return;
      }
      console.log("[VideoCallContext] Setting pending incoming call:", call.id.slice(0, 8));
      setPendingIncomingCall(call);
    },
  });

  // Sync incoming call state - prioritize pendingIncomingCall to avoid flicker
  // Only show incoming call when we're truly idle AND UI-lock is not active
  const incomingCall = (status === "idle" && !isCallUiActive) ? pendingIncomingCall : null;
  
  // Debug logging
  console.log("[VideoCallContext] State:", { 
    status, 
    hasCurrentCall: !!currentCall, 
    hasPendingIncoming: !!pendingIncomingCall,
    hasDetectedIncoming: !!detectedIncomingCall,
    isCallUiActive,
  });

  const answerCall = useCallback(async (call: VideoCall) => {
    console.log("[VideoCallContext] answerCall: Activating UI-lock BEFORE getUserMedia");
    setIsCallUiActive(true); // Activate UI-lock BEFORE getUserMedia
    setPendingIncomingCall(null);
    clearIncomingCall();
    
    try {
      await answerVideoCall(call);
      void bootstrapCallsV2Room(call, "callee");
    } catch (err) {
      console.error("[VideoCallContext] answerCall error:", err);
      setIsCallUiActive(false); // Release UI-lock on error
    }
  }, [answerVideoCall, clearIncomingCall, bootstrapCallsV2Room]);

  const declineCall = useCallback(async () => {
    if (incomingCall || pendingIncomingCall) {
      const callToDecline = incomingCall || pendingIncomingCall;
      if (!callToDecline) return;
      
      // We don't use the hook's endCall since we haven't answered yet
      // Just update the DB directly
      await supabase
        .from("video_calls")
        .update({
          status: "declined",
          ended_at: new Date().toISOString(),
        })
        .eq("id", callToDecline.id);
      
      setPendingIncomingCall(null);
      clearIncomingCall();
      setIsCallUiActive(false); // Release UI-lock
    }
  }, [incomingCall, pendingIncomingCall, clearIncomingCall]);

  const endCall = useCallback(async () => {
    console.log("[VideoCallContext] endCall called");
    if (currentCall) {
      await endVideoCall("ended");
    } else if (incomingCall || pendingIncomingCall) {
      await declineCall();
    }
    closeCallsV2();
    setIsCallUiActive(false); // Release UI-lock
  }, [currentCall, incomingCall, pendingIncomingCall, endVideoCall, declineCall, closeCallsV2]);

  const startCall = useCallback(async (
    calleeId: string,
    conversationId: string | null,
    callType: "video" | "audio"
  ) => {
    if (!user) return null;
    
    console.log("[VideoCallContext] startCall: Activating UI-lock BEFORE startVideoCall");
    setIsCallUiActive(true); // Activate UI-lock BEFORE getUserMedia (happens inside startVideoCall)
    
    try {
      const result = await startVideoCall(calleeId, conversationId, callType);
      if (result) {
        void bootstrapCallsV2Room(result, "caller");
      }
      if (!result) {
        console.log("[VideoCallContext] startCall returned null, releasing UI-lock");
        setIsCallUiActive(false); // Release UI-lock if call failed
        // Show permission error toast
        toast.error(
          callType === "video" 
            ? "Нет доступа к камере или микрофону"
            : "Нет доступа к микрофону",
          {
            description: "Разрешите доступ в настройках браузера",
            duration: 5000,
          }
        );
      }
      return result;
    } catch (err) {
      console.error("[VideoCallContext] startCall error:", err);
      setIsCallUiActive(false); // Release UI-lock on error
      toast.error("Ошибка при начале звонка", {
        description: "Попробуйте еще раз",
        duration: 4000,
      });
      return null;
    }
  }, [user, startVideoCall, bootstrapCallsV2Room]);

  const retryConnection = useCallback(async () => {
    await retryWithFreshCredentials();
  }, [retryWithFreshCredentials]);

  useEffect(() => {
    if (!currentCall || !localStream) return;
    void bootstrapCallsV2Media(currentCall, localStream);
  }, [currentCall, localStream, bootstrapCallsV2Media]);

  const value: VideoCallContextType = {
    status,
    currentCall,
    incomingCall,
    localStream,
    remoteStream,
    isMuted,
    isVideoOff,
    connectionState,
    isCallUiActive,
    startCall,
    answerCall,
    declineCall,
    endCall,
    toggleMute,
    toggleVideo,
    retryConnection,
  };

  useEffect(() => {
    return onNativeCallAction(async (action) => {
      const actionType = action.type;
      const incomingLike = pendingIncomingCall ?? incomingCall;
      const matchesIncoming = incomingLike?.id === action.callId;
      const matchesCurrent = currentCall?.id === action.callId;

      if ((actionType === "accept" || actionType === "answer") && incomingLike && matchesIncoming) {
        await answerCall(incomingLike);
        return;
      }

      if ((actionType === "decline" || actionType === "reject") && matchesIncoming) {
        await declineCall();
        return;
      }

      if ((actionType === "end" || actionType === "disconnect") && matchesCurrent) {
        await endCall();
      }
    });
  }, [pendingIncomingCall, incomingCall, currentCall, answerCall, declineCall, endCall]);

  useEffect(() => {
    return () => {
      closeCallsV2();
    };
  }, [closeCallsV2]);

  return (
    <VideoCallContext.Provider value={value}>
      {children}
    </VideoCallContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useVideoCallContext() {
  const context = useContext(VideoCallContext);
  if (!context) {
    throw new Error("useVideoCallContext must be used within VideoCallProvider");
  }
  return context;
}

// Re-export types
export type { VideoCall, VideoCallStatus };
