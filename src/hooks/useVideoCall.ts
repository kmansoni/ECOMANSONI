import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getIceServers, getMediaConstraints, clearIceServerCache } from "@/lib/webrtc-config";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type VideoCallStatus = "idle" | "calling" | "ringing" | "connected" | "ended";

export interface VideoCall {
  id: string;
  caller_id: string;
  callee_id: string;
  conversation_id: string | null;
  call_type: "video" | "audio";
  status: string;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  caller_profile?: { display_name: string | null; avatar_url: string | null };
  callee_profile?: { display_name: string | null; avatar_url: string | null };
}

interface UseVideoCallOptions {
  onIncomingCall?: (call: VideoCall) => void;
  onCallEnded?: (call: VideoCall) => void;
}

const CALL_TIMEOUT_MS = 60000; // 60 seconds
const ICE_RESTART_DELAY_MS = 3000;
const MAX_ICE_RESTARTS = 3;
// DB fallback signaling: Realtime INSERT is primary; polling is only a safety net.
const SIGNAL_POLL_INTERVAL_MS = 1500;

function getStableDeviceId(): string {
  const key = "mansoni_device_id";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const created = globalThis.crypto?.randomUUID?.() ?? `dev_${Date.now()}`;
  window.localStorage.setItem(key, created);
  return created;
}

export function useVideoCall(options: UseVideoCallOptions = {}) {
  const { user } = useAuth();
  const [status, setStatus] = useState<VideoCallStatus>("idle");
  const [currentCall, setCurrentCall] = useState<VideoCall | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [connectionState, setConnectionState] = useState<string>("new");
  
  // Remote stream ref for reliable track accumulation
  const remoteStreamRef = useRef<MediaStream | null>(null);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const broadcastChannelRef = useRef<RealtimeChannel | null>(null);
  const signalsChannelRef = useRef<RealtimeChannel | null>(null);
  const callTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const signalPollRef = useRef<NodeJS.Timeout | null>(null);
  const iceRestartCountRef = useRef(0);
  const isCleaningUpRef = useRef(false);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const localStreamRef = useRef<MediaStream | null>(null);
  
  // Track if we're in an active call process (used to prevent visibility-based cleanup)
  const isCallActiveRef = useRef(false);

  const log = useCallback((msg: string, ...args: any[]) => {
    console.log(`[VideoCall] ${msg}`, ...args);
  }, []);

  const warn = useCallback((msg: string, ...args: any[]) => {
    console.warn(`[VideoCall] ${msg}`, ...args);
  }, []);

  // Persist debug info to DB so we can debug Telegram iOS where console is unreliable
  const debugEvent = useCallback(
    async (callId: string, stage: string, payload: Record<string, any> = {}) => {
      try {
        await supabase.from("video_call_signals").insert({
          call_id: callId,
          sender_id: user?.id ?? "00000000-0000-0000-0000-000000000000",
          signal_type: "debug",
          signal_data: {
            stage,
            ts: new Date().toISOString(),
            ...payload,
          },
        });
      } catch {
        // never throw from debug
      }
    },
    [user]
  );

  // Keep localStreamRef in sync
  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  // Cleanup function with reason parameter for diagnostics
  const cleanup = useCallback(async (reason: string = "unknown") => {
    if (isCleaningUpRef.current) {
      log(`Cleanup already in progress, ignoring (reason: ${reason})`);
      return;
    }
    isCleaningUpRef.current = true;
    isCallActiveRef.current = false;
    
    log(`Cleaning up... reason: ${reason}`);

    if (callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = null;
    }

    if (signalPollRef.current) {
      clearInterval(signalPollRef.current);
      signalPollRef.current = null;
    }

    if (broadcastChannelRef.current) {
      await supabase.removeChannel(broadcastChannelRef.current);
      broadcastChannelRef.current = null;
    }

    if (signalsChannelRef.current) {
      await supabase.removeChannel(signalsChannelRef.current);
      signalsChannelRef.current = null;
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    // Use ref to get current stream value
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }

    remoteStreamRef.current = null;
    setRemoteStream(null);
    setStatus("idle");
    setCurrentCall(null);
    setConnectionState("new");
    setIsMuted(false);
    setIsVideoOff(false);
    iceRestartCountRef.current = 0;
    pendingCandidatesRef.current = [];
    isCleaningUpRef.current = false;
  }, [log]);

  // Visibility change handler - protect against Telegram Mini App visibility events
  useEffect(() => {
    const handleVisibilityChange = () => {
      log(`Visibility changed: ${document.visibilityState}, isCallActive: ${isCallActiveRef.current}`);
      
      // Don't cleanup when page becomes hidden if we're in an active call
      // This is critical for Telegram Mini App where permission prompts trigger visibility changes
      if (document.visibilityState === "hidden" && isCallActiveRef.current) {
        log("Page hidden during active call - NOT cleaning up (Telegram Mini App protection)");
        return;
      }
      
      if (document.visibilityState === "visible" && isCallActiveRef.current) {
        log("Page visible again during active call - continuing");
      }
    };

    const handlePageHide = (event: PageTransitionEvent) => {
      log(`pagehide event, persisted: ${event.persisted}, isCallActive: ${isCallActiveRef.current}`);
      
      // Don't cleanup on pagehide if we're in an active call
      if (isCallActiveRef.current) {
        log("pagehide during active call - NOT cleaning up (Telegram Mini App protection)");
        return;
      }
    };

    const handlePageShow = (event: PageTransitionEvent) => {
      log(`pageshow event, persisted: ${event.persisted}, isCallActive: ${isCallActiveRef.current}`);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [log]);

  // Send signal via both Broadcast and DB
  const sendSignal = useCallback(async (
    callId: string,
    signalType: string,
    signalData: any
  ) => {
    if (!user) return;

    // 1. Send via Broadcast (primary, low latency)
    if (broadcastChannelRef.current) {
      try {
        await broadcastChannelRef.current.send({
          type: "broadcast",
          event: "signal",
          payload: {
            from: user.id,
            type: signalType,
            data: signalData,
          },
        });
        log(`Sent ${signalType} via Broadcast`);
      } catch (err) {
        warn("Broadcast send failed:", err);
      }
    }

    // 2. Insert into DB (fallback)
    try {
      await supabase.from("video_call_signals").insert({
        call_id: callId,
        sender_id: user.id,
        processed: false,
        signal_type: signalType,
        signal_data: signalData,
      });
      log(`Saved ${signalType} to DB`);
    } catch (err) {
      warn("DB signal insert failed:", err);
    }
  }, [user, log, warn]);

  // Process incoming signal
  const handleSignal = useCallback(async (
    signalType: string,
    signalData: any,
    fromUserId: string
  ) => {
    if (fromUserId === user?.id) return;

    log(`Processing ${signalType} from ${fromUserId.slice(0, 8)}`);

    try {
      switch (signalType) {
        case "offer": {
          // If we receive a new offer while already having a PC, the other side may have restarted
          // (e.g., relay retry). We need to handle this gracefully:
          // 1. If PC is in "failed" or "closed" state, recreate it
          // 2. Otherwise, just set the new remote description (rollback happens automatically)
          
          const pc = peerConnectionRef.current;
          const needsRecreation = !pc || pc.connectionState === "failed" || pc.connectionState === "closed";
          
          if (needsRecreation && localStreamRef.current && currentCall) {
            log("Recreating PC to handle new offer (previous was failed/closed/missing)");
            if (pc) {
              pc.close();
            }
            peerConnectionRef.current = null;
            pendingCandidatesRef.current = [];
            
            // Get fresh ICE servers with relay forced (since other side likely restarted with relay)
            clearIceServerCache();
            const config = await getIceServers(true); // Force relay to match sender
            const newPc = new RTCPeerConnection(config);
            
            // Add local tracks
            localStreamRef.current.getTracks().forEach(track => {
              newPc.addTrack(track, localStreamRef.current!);
            });
            
            // Handle remote tracks - accumulate into a single MediaStream
            newPc.ontrack = (event) => {
              log("Received remote track (recreated PC):", event.track.kind, "readyState:", event.track.readyState);
              
              // Create or reuse remote stream
              if (!remoteStreamRef.current) {
                remoteStreamRef.current = new MediaStream();
              }
              
              // Check if track already exists
              const existingTrack = remoteStreamRef.current.getTracks().find(
                t => t.kind === event.track.kind
              );
              
              if (existingTrack) {
                log("Replacing existing", event.track.kind, "track (recreated PC)");
                remoteStreamRef.current.removeTrack(existingTrack);
              }
              
              // Add the new track
              remoteStreamRef.current.addTrack(event.track);
              log("Remote stream now has tracks:", remoteStreamRef.current.getTracks().map(t => t.kind).join(", "));
              
              // IMPORTANT: Create new MediaStream reference to trigger React update
              setRemoteStream(new MediaStream(remoteStreamRef.current.getTracks()));
            };
            
            // ICE candidates
            newPc.onicecandidate = (event) => {
              if (event.candidate && currentCall) {
                sendSignal(currentCall.id, "ice-candidate", event.candidate.toJSON());
              }
            };
            
            // Connection state monitoring (simplified for re-created PC)
            newPc.onconnectionstatechange = () => {
              const state = newPc.connectionState;
              log("Recreated PC connection state:", state);
              setConnectionState(state);
              if (state === "connected") {
                setStatus("connected");
                if (callTimeoutRef.current) {
                  clearTimeout(callTimeoutRef.current);
                  callTimeoutRef.current = null;
                }
              }
            };
            
            peerConnectionRef.current = newPc;
          }
          
          if (!peerConnectionRef.current) {
            log("No peer connection available for offer, ignoring");
            return;
          }
          
          await peerConnectionRef.current.setRemoteDescription(
            new RTCSessionDescription(signalData)
          );
          // Apply pending candidates
          for (const candidate of pendingCandidatesRef.current) {
            await peerConnectionRef.current.addIceCandidate(
              new RTCIceCandidate(candidate)
            );
          }
          pendingCandidatesRef.current = [];
          
          const answer = await peerConnectionRef.current.createAnswer();
          await peerConnectionRef.current.setLocalDescription(answer);
          if (currentCall) {
            await sendSignal(currentCall.id, "answer", answer);
          }
          break;
        }

        case "answer":
          if (!peerConnectionRef.current) {
            log("No peer connection for answer, ignoring");
            return;
          }
          await peerConnectionRef.current.setRemoteDescription(
            new RTCSessionDescription(signalData)
          );
          // Apply pending candidates
          for (const candidate of pendingCandidatesRef.current) {
            await peerConnectionRef.current.addIceCandidate(
              new RTCIceCandidate(candidate)
            );
          }
          pendingCandidatesRef.current = [];
          break;

        case "ice-candidate":
          if (!peerConnectionRef.current) {
            // Buffer candidate for later
            pendingCandidatesRef.current.push(signalData);
            return;
          }
          if (peerConnectionRef.current.remoteDescription) {
            await peerConnectionRef.current.addIceCandidate(
              new RTCIceCandidate(signalData)
            );
          } else {
            // Buffer candidate
            pendingCandidatesRef.current.push(signalData);
          }
          break;

        case "hangup":
          log("Received hangup signal from remote peer, reason:", signalData?.reason);
          // Immediately notify about call end to release UI-lock
          if (currentCall) {
            options.onCallEnded?.(currentCall);
          }
          await cleanup("hangup_signal_received");
          break;
      }
    } catch (err) {
      warn("Error handling signal:", err);
    }
  }, [user, currentCall, sendSignal, cleanup, log, warn, options]);

  // Listen for DB fallback signals via Realtime (primary) + polling (safety net)
  const startSignalPolling = useCallback((callId: string) => {
    if (signalPollRef.current) {
      clearInterval(signalPollRef.current);
    }

    // Realtime subscription for INSERTs into video_call_signals
    if (signalsChannelRef.current) {
      supabase.removeChannel(signalsChannelRef.current);
      signalsChannelRef.current = null;
    }

    const channel = supabase
      .channel(`video-call-signals:${callId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "video_call_signals",
          filter: `call_id=eq.${callId}`,
        },
        async (payload) => {
          if (!user) return;
          const signal = payload.new as any;
          if (!signal) return;
          if (signal.sender_id === user.id) return;
          // processed can be NULL; treat NULL as not processed
          if (signal.processed === true) return;

          try {
            await handleSignal(signal.signal_type, signal.signal_data, signal.sender_id);
          } finally {
            // Best-effort mark as processed to prevent re-processing (poll fallback will also respect this)
            try {
              await supabase
                .from("video_call_signals")
                .update({ processed: true })
                .eq("id", signal.id);
            } catch {
              // ignore
            }
          }
        }
      )
      .subscribe((subStatus) => {
        log("Signals realtime subscription:", subStatus);
      });

    signalsChannelRef.current = channel;

    signalPollRef.current = setInterval(async () => {
      if (!user) return;

      const { data: signals } = await supabase
        .from("video_call_signals")
        .select("*")
        .eq("call_id", callId)
        // processed is nullable in DB; treat NULL as not processed
        .or("processed.is.null,processed.eq.false")
        .neq("sender_id", user.id)
        .order("created_at", { ascending: true });

      if (signals && signals.length > 0) {
        for (const signal of signals) {
          await handleSignal(
            signal.signal_type,
            signal.signal_data,
            signal.sender_id
          );

          // Mark as processed
          await supabase
            .from("video_call_signals")
            .update({ processed: true })
            .eq("id", signal.id);
        }
      }
    }, SIGNAL_POLL_INTERVAL_MS);
  }, [user, handleSignal, log]);

  // Setup broadcast channel
  const setupBroadcastChannel = useCallback((callId: string) => {
    if (broadcastChannelRef.current) {
      supabase.removeChannel(broadcastChannelRef.current);
    }

    const channel = supabase.channel(`video-call:${callId}`, {
      config: { broadcast: { self: false } },
    });

    // Attach handlers BEFORE subscribing (critical for iOS/Safari)
    channel.on("broadcast", { event: "signal" }, ({ payload }) => {
      if (payload.from !== user?.id) {
        handleSignal(payload.type, payload.data, payload.from);
      }
    });

    channel.subscribe((status) => {
      log("Broadcast channel status:", status);
    });

    broadcastChannelRef.current = channel;
  }, [user, handleSignal, log]);

  // Create peer connection
  const createPeerConnection = useCallback(async (
    stream: MediaStream,
    callId: string,
    isInitiator: boolean,
    forceRelay: boolean = false
  ) => {
    // Important: do NOT force TURN-only by default.
    // Some Telegram/WebView networks block certain public TURNs; if we force `relay`, ICE may never connect.
    // We start with `all` and only switch to `relay` on actual failure (see retry logic).
    const isTelegramIOS = /iPhone|iPad/i.test(navigator.userAgent) &&
      ((window as any).Telegram?.WebApp || /Telegram/i.test(navigator.userAgent));

    log("Creating peer connection, initiator:", isInitiator, "forceRelay:", forceRelay, "isTelegramIOS:", isTelegramIOS);

    const config = await getIceServers(forceRelay);
    const pc = new RTCPeerConnection(config);

    // Add local tracks
    stream.getTracks().forEach(track => {
      pc.addTrack(track, stream);
    });

    // Handle remote tracks - accumulate into a single MediaStream
    pc.ontrack = (event) => {
      log("Received remote track:", event.track.kind, "readyState:", event.track.readyState);
      
      // Create or reuse remote stream
      if (!remoteStreamRef.current) {
        remoteStreamRef.current = new MediaStream();
      }
      
      // Check if track already exists
      const existingTrack = remoteStreamRef.current.getTracks().find(
        t => t.kind === event.track.kind
      );
      
      if (existingTrack) {
        log("Replacing existing", event.track.kind, "track");
        remoteStreamRef.current.removeTrack(existingTrack);
      }
      
      // Add the new track
      remoteStreamRef.current.addTrack(event.track);
      log("Remote stream now has tracks:", remoteStreamRef.current.getTracks().map(t => t.kind).join(", "));
      
      // IMPORTANT: Create new MediaStream reference to trigger React update
      setRemoteStream(new MediaStream(remoteStreamRef.current.getTracks()));
    };

    // ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal(callId, "ice-candidate", event.candidate.toJSON());
      }
    };

    // Connection state monitoring
     pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      log("Connection state:", state);
      setConnectionState(state);

      if (state === "connected") {
        setStatus("connected");
        if (callTimeoutRef.current) {
          clearTimeout(callTimeoutRef.current);
          callTimeoutRef.current = null;
        }
      } else if (state === "failed") {
         // If we're not already forcing relay, try a hard restart with TURN-only first.
         // This helps on Telegram iOS / restrictive NATs where STUN candidates fail.
         if (!forceRelay && iceRestartCountRef.current === 0) {
           warn("Connection failed - retrying with TURN-only (relay)");
           iceRestartCountRef.current++; // Count this as a restart attempt
           setTimeout(async () => {
             try {
               clearIceServerCache();
               // Recreate the whole PeerConnection with relay policy
               if (peerConnectionRef.current) {
                 peerConnectionRef.current.close();
               }
               peerConnectionRef.current = null;
               pendingCandidatesRef.current = [];
               // CRITICAL: Always set isInitiator=true on relay retry so a NEW OFFER is sent
               // Otherwise the other party never knows we restarted and connection hangs
               await createPeerConnection(stream, callId, true, true);
               log("Recreated peer connection with forceRelay=true, new offer sent");
             } catch (err) {
               warn("Relay retry failed:", err);
             }
           }, ICE_RESTART_DELAY_MS);
           return;
         }

        if (iceRestartCountRef.current < MAX_ICE_RESTARTS) {
          iceRestartCountRef.current++;
          log(`ICE restart attempt ${iceRestartCountRef.current}`);
          setTimeout(async () => {
            try {
              const offer = await pc.createOffer({ iceRestart: true });
              await pc.setLocalDescription(offer);
              await sendSignal(callId, "offer", offer);
            } catch (err) {
              warn("ICE restart failed:", err);
            }
          }, ICE_RESTART_DELAY_MS);
        } else {
          warn("Max ICE restarts reached, ending call");
          cleanup("max_ice_restarts");
        }
      } else if (state === "disconnected") {
        // Grace period before cleanup
        setTimeout(() => {
          if (pc.connectionState === "disconnected") {
            log("Connection still disconnected after grace period");
          }
        }, 12000);
      }
    };

    pc.oniceconnectionstatechange = () => {
      log("ICE connection state:", pc.iceConnectionState);
    };

    peerConnectionRef.current = pc;

    // Create offer if initiator
    if (isInitiator) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await sendSignal(callId, "offer", offer);
    }

    return pc;
  }, [sendSignal, cleanup, log, warn]);

  // Start outgoing call
  const startCall = useCallback(async (
    calleeId: string,
    conversationId: string | null,
    callType: "video" | "audio"
  ): Promise<VideoCall | null> => {
    if (!user || status !== "idle") {
      warn("Cannot start call:", { user: !!user, status });
      return null;
    }

    log("Starting call to:", calleeId.slice(0, 8));
    isCallActiveRef.current = true; // Mark call as active BEFORE getUserMedia
    setStatus("calling");

    try {
      // Get media
      log("Requesting getUserMedia...");
      const constraints = getMediaConstraints(callType);
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      log("getUserMedia SUCCESS - got stream with tracks:", stream.getTracks().length);
      setLocalStream(stream);

      // Create call record
      log("Creating call record in DB...");
      const { data: callData, error: callError } = await supabase
        .from("video_calls")
        .insert({
          caller_id: user.id,
          callee_id: calleeId,
          conversation_id: conversationId,
          call_type: callType,
          status: "ringing",
        })
        .select()
        .single();

      if (callError || !callData) {
        throw new Error(callError?.message || "Failed to create call");
      }
      log("Call record created:", callData.id.slice(0, 8));

      const call: VideoCall = {
        ...callData,
        call_type: callType,
      };
      setCurrentCall(call);

      // Setup signaling
      log("Setting up broadcast channel...");
      setupBroadcastChannel(call.id);
      startSignalPolling(call.id);
      await sendSignal(call.id, "call.invite", {
        call_id: call.id,
        from: user.id,
        to: calleeId,
        device_id: getStableDeviceId(),
        call_type: callType,
      });

      // Create peer connection and offer
      log("Creating peer connection...");
      // Start with iceTransportPolicy=all; if ICE fails we automatically retry with relay.
      await createPeerConnection(stream, call.id, true, false);
      log("Peer connection created and offer sent");

      // Start timeout
      callTimeoutRef.current = setTimeout(async () => {
        log("Call timeout - marking as missed");
        await supabase
          .from("video_calls")
          .update({ status: "missed", ended_at: new Date().toISOString() })
          .eq("id", call.id);
        await cleanup("call_timeout");
      }, CALL_TIMEOUT_MS);

      return call;
    } catch (err) {
      warn("Start call error:", err);
      isCallActiveRef.current = false;
      await cleanup("start_call_error");
      return null;
    }
  }, [user, status, setupBroadcastChannel, startSignalPolling, createPeerConnection, sendSignal, cleanup, log, warn]);

  // Answer incoming call
  const answerCall = useCallback(async (call: VideoCall) => {
    if (!user) return;

    // FIRST: Send early debug event IMMEDIATELY (non-blocking) - before anything else
    // This helps debug when the function is called but crashes before getUserMedia
    (async () => {
      try {
        await supabase.from("video_call_signals").insert({
          call_id: call.id,
          sender_id: user.id,
          signal_type: "debug",
          signal_data: {
            stage: "answer_fn_entered",
            ts: new Date().toISOString(),
            callType: call.call_type,
            platform: navigator.platform,
            ua: navigator.userAgent.slice(0, 100),
            isTelegram: !!(window as any).Telegram?.WebApp,
          },
        });
      } catch {
        // never throw from early debug
      }
    })();

    log("Answering call:", call.id.slice(0, 8), "type:", call.call_type);
    void debugEvent(call.id, "answer_start", { call_type: call.call_type });
    isCallActiveRef.current = true; // Mark call as active BEFORE getUserMedia
    setStatus("ringing");
    setCurrentCall(call);

    try {
      // Get media with timeout
      log("Requesting getUserMedia for answer...");
      const constraints = getMediaConstraints(call.call_type);
      log("Media constraints:", JSON.stringify(constraints));
      void debugEvent(call.id, "answer_getusermedia_request", { constraints });
      
      let stream: MediaStream;
      const GETUSERMEDIA_TIMEOUT_MS = 10000; // 10 seconds timeout
      
      try {
        // Add timeout to getUserMedia to prevent hanging on iOS
        const mediaPromise = navigator.mediaDevices.getUserMedia(constraints);
        const timeoutPromise = new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error("getUserMedia timeout after 10s")), GETUSERMEDIA_TIMEOUT_MS)
        );
        
        stream = await Promise.race([mediaPromise, timeoutPromise]);
        log("getUserMedia SUCCESS for answer - got stream with tracks:", stream.getTracks().map(t => t.kind).join(", "));
        void debugEvent(call.id, "answer_getusermedia_success", {
          tracks: stream.getTracks().map((t) => ({ kind: t.kind, enabled: t.enabled, readyState: t.readyState })),
        });
      } catch (mediaErr: any) {
        warn("getUserMedia FAILED:", mediaErr.name, mediaErr.message);
        void debugEvent(call.id, "answer_getusermedia_failed", {
          name: mediaErr?.name,
          message: mediaErr?.message,
        });
        
        // If video fails, try audio-only as fallback
        if (call.call_type === "video") {
          log("Retrying with audio-only fallback...");
          const audioOnlyConstraints = getMediaConstraints("audio");
          void debugEvent(call.id, "answer_getusermedia_retry_audio_only", { audioOnlyConstraints });
          
          try {
            // Also apply timeout to fallback
            const fallbackPromise = navigator.mediaDevices.getUserMedia(audioOnlyConstraints);
            const fallbackTimeout = new Promise<never>((_, reject) => 
              setTimeout(() => reject(new Error("Audio fallback timeout")), GETUSERMEDIA_TIMEOUT_MS)
            );
            stream = await Promise.race([fallbackPromise, fallbackTimeout]);
            log("Audio-only fallback succeeded");
            void debugEvent(call.id, "answer_getusermedia_audio_only_success");
          } catch (fallbackErr: any) {
            warn("Audio fallback also failed:", fallbackErr);
            void debugEvent(call.id, "answer_getusermedia_audio_fallback_failed", {
              name: fallbackErr?.name,
              message: fallbackErr?.message,
            });
            throw fallbackErr;
          }
        } else {
          throw mediaErr;
        }
      }
      
      setLocalStream(stream);

      // Update call status FIRST (so caller knows we answered)
      log("Updating call status to answered...");
      void debugEvent(call.id, "answer_update_call_status_request");
      await supabase
        .from("video_calls")
        .update({
          status: "answered",
          started_at: new Date().toISOString(),
        })
        .eq("id", call.id);
      void debugEvent(call.id, "answer_update_call_status_success");
      await sendSignal(call.id, "call.accept", {
        call_id: call.id,
        from: user.id,
        device_id: getStableDeviceId(),
      });

      // Check if there's already an offer in the DB BEFORE setting up polling
      // This prevents race conditions where polling marks the offer as processed
      log("Checking for existing offer in DB...");
      const { data: existingSignals } = await supabase
        .from("video_call_signals")
        .select("*")
        .eq("call_id", call.id)
        .eq("signal_type", "offer")
        .order("created_at", { ascending: false })
        .limit(1);

      const existingOffer = existingSignals && existingSignals.length > 0 
        ? existingSignals[0] 
        : null;
      
      if (existingOffer) {
        log("Found existing offer in DB:", existingOffer.id.slice(0, 8));
      } else {
        log("No existing offer found yet");
      }

      // Setup signaling (Broadcast for live signals)
      log("Setting up broadcast channel for answer...");
      setupBroadcastChannel(call.id);
      void debugEvent(call.id, "answer_broadcast_setup_done");

      // Create peer connection (not initiator - will process offer)
      log("Creating peer connection for answer...");
      // Start with iceTransportPolicy=all; if ICE fails we automatically retry with relay.
      await createPeerConnection(stream, call.id, false, false);
      log("Peer connection created for answer");
      void debugEvent(call.id, "answer_pc_created");

      // If we found an offer earlier, process it NOW (after PC is ready)
      if (existingOffer && peerConnectionRef.current && existingOffer.sender_id !== user.id) {
        try {
          log("Processing existing offer...");
          await peerConnectionRef.current.setRemoteDescription(
            new RTCSessionDescription(existingOffer.signal_data as unknown as RTCSessionDescriptionInit)
          );
          
          // Apply any buffered ICE candidates
          for (const candidate of pendingCandidatesRef.current) {
            await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
          }
          pendingCandidatesRef.current = [];
          
          const answer = await peerConnectionRef.current.createAnswer();
          await peerConnectionRef.current.setLocalDescription(answer);
          await sendSignal(call.id, "answer", answer);
          log("Processed existing offer and sent answer");
          
          // Mark offer as processed
          await supabase
            .from("video_call_signals")
            .update({ processed: true })
            .eq("id", existingOffer.id);
        } catch (err) {
          warn("Error processing existing offer:", err);
        }
      }
      
      // Start polling AFTER we've processed any existing offer
      // This prevents polling from interfering with our manual processing
      startSignalPolling(call.id);
      void debugEvent(call.id, "answer_polling_started");

      // Send ready signal (indicates we're ready to receive/process offer)
      await sendSignal(call.id, "ready", { userId: user.id });
      void debugEvent(call.id, "answer_ready_sent");
      log("Answer call setup complete");
    } catch (err: any) {
      warn("Answer call error:", err);
      void debugEvent(call.id, "answer_fatal_error", {
        name: err?.name,
        message: err?.message,
      });
      isCallActiveRef.current = false;
      await cleanup("answer_call_error");
    }
  }, [user, debugEvent, setupBroadcastChannel, startSignalPolling, createPeerConnection, sendSignal, cleanup, log, warn]);

  // Decline/End call
  const endCall = useCallback(async (reason: "declined" | "ended" = "ended") => {
    if (!currentCall) return;

    log("Ending call with reason:", reason);

    // Update DB FIRST - this triggers realtime update for the other party
    // This is critical for synchronizing UI state across both users
    await supabase
      .from("video_calls")
      .update({
        status: reason,
        ended_at: new Date().toISOString(),
      })
      .eq("id", currentCall.id);

    // Send explicit lifecycle signal + generic hangup as backup.
    await sendSignal(currentCall.id, reason === "declined" ? "call.decline" : "call.hangup", {
      call_id: currentCall.id,
      from: user?.id ?? null,
      device_id: getStableDeviceId(),
      reason,
    });
    await sendSignal(currentCall.id, "hangup", { reason });

    // Cleanup local state
    options.onCallEnded?.(currentCall);
    await cleanup(`end_call_${reason}`);
  }, [currentCall, sendSignal, cleanup, log, options, user]);

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  }, [localStream]);

  // Toggle video
  const toggleVideo = useCallback(() => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
      }
    }
  }, [localStream]);

  // Retry with fresh TURN credentials
  const retryWithFreshCredentials = useCallback(async () => {
    if (!currentCall || !localStream) return;

    log("Retrying with fresh TURN credentials...");
    clearIceServerCache();

    // Close current peer connection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }

    iceRestartCountRef.current = 0;

    // Create new peer connection
    // Force relay on manual retry to bypass NAT/firewall issues
    await createPeerConnection(
      localStream,
      currentCall.id,
      currentCall.caller_id === user?.id,
      true
    );
  }, [currentCall, localStream, user, createPeerConnection, log]);

  // NOTE: Incoming calls are handled by useIncomingCalls hook separately
  // This avoids duplicate subscriptions and race conditions

  // Subscribe to call status changes + fallback polling
  useEffect(() => {
    if (!currentCall) return;

    let statusPollInterval: NodeJS.Timeout | null = null;

    const handleCallStatusUpdate = (updatedStatus: string) => {
      log("Call status updated:", updatedStatus);

      if (updatedStatus === "answered" && status === "calling") {
        setStatus("ringing");
      } else if (
        updatedStatus === "declined" ||
        updatedStatus === "ended" ||
        updatedStatus === "missed"
      ) {
        log("Remote party ended call, releasing UI...");
        // CRITICAL: Call onCallEnded FIRST to release UI-lock before cleanup
        options.onCallEnded?.(currentCall);
        cleanup("call_status_changed_to_" + updatedStatus);
      }
    };

    // Realtime subscription (primary)
    const channel = supabase
      .channel(`call-status:${currentCall.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "video_calls",
          filter: `id=eq.${currentCall.id}`,
        },
        (payload) => {
          const updated = payload.new as VideoCall;
          handleCallStatusUpdate(updated.status);
        }
      )
      .subscribe((subStatus) => {
        log("Call status subscription:", subStatus);
      });

    // Fallback polling every 2 seconds
    // This ensures we catch status changes even if realtime fails
    statusPollInterval = setInterval(async () => {
      try {
        const { data } = await supabase
          .from("video_calls")
          .select("status")
          .eq("id", currentCall.id)
          .single();

        if (data && ["declined", "ended", "missed"].includes(data.status)) {
          log("Poll detected call ended:", data.status);
          handleCallStatusUpdate(data.status);
        }
      } catch {
        // Silent fail
      }
    }, 2000);

    return () => {
      supabase.removeChannel(channel);
      if (statusPollInterval) clearInterval(statusPollInterval);
    };
  }, [currentCall, status, cleanup, log, options]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup("component_unmount");
    };
  }, [cleanup]);

  return {
    status,
    currentCall,
    localStream,
    remoteStream,
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
