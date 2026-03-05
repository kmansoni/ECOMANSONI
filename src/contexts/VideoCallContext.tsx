import { createContext, useContext, ReactNode, useState, useCallback, useEffect, useRef } from "react";
import { getStableCallsDeviceId } from "@/lib/platform/device";
import { useVideoCallSfu, type VideoCall, type VideoCallStatus } from "@/hooks/useVideoCallSfu";
import { useIncomingCalls } from "@/hooks/useIncomingCalls";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { onNativeCallAction } from "@/lib/native/callBridge";
import { supabase } from "@/integrations/supabase/client";
import { CallsWsClient } from "@/calls-v2/wsClient";
import { SfuMediaManager } from "@/calls-v2/sfuMediaManager";
import { CallKeyExchange } from "@/calls-v2/callKeyExchange";
import { CallMediaEncryption } from "@/calls-v2/callMediaEncryption";
import { RekeyStateMachine } from "@/calls-v2/rekeyStateMachine";
import { EpochGuard } from "@/calls-v2/epochGuard";
import type { RtpCapabilities } from "@/calls-v2/types";
import type { CallIdentity, KeyPackageData } from "@/calls-v2/callKeyExchange";
import type { RekeyEvent } from "@/calls-v2/rekeyStateMachine";

const CALLS_V2_ENABLED = import.meta.env.VITE_CALLS_V2_ENABLED === "true";
const CALLS_V2_WS_URL = (import.meta.env.VITE_CALLS_V2_WS_URL ?? "").trim();
const CALLS_V2_WS_URLS = (import.meta.env.VITE_CALLS_V2_WS_URLS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const REKEY_INTERVAL_MS = Math.max(30_000, Number(import.meta.env.VITE_CALLS_V2_REKEY_INTERVAL_MS ?? "120000"));
const FRAME_E2EE_ADVERTISE_SFRAME = import.meta.env.VITE_CALLS_FRAME_E2EE_ADVERTISE_SFRAME === "true";

function normalizeWsEndpoint(raw: string): string {
  const value = String(raw || "").trim();
  if (!value) return "";

  if (value.startsWith("ws://") || value.startsWith("wss://")) return value;
  if (value.startsWith("http://")) return `ws://${value.slice("http://".length)}`;
  if (value.startsWith("https://")) return `wss://${value.slice("https://".length)}`;
  if (value.startsWith("/")) {
    const scheme = window.location.protocol === "https:" ? "wss" : "ws";
    return `${scheme}://${window.location.host}${value}`;
  }

  const scheme = window.location.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${value}`;
}

function isLocalEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    const h = url.hostname.toLowerCase();
    return h === "localhost" || h === "127.0.0.1" || h === "::1";
  } catch {
    return false;
  }
}

function hasInsertableStreamsSupport(): boolean {
  try {
    return typeof RTCRtpSender !== "undefined" && "createEncodedStreams" in RTCRtpSender.prototype;
  } catch {
    return false;
  }
}

function toBase64Utf8(value: string): string {
  // Correct encoding: encodeURIComponent → percent-decode each byte → btoa.
  // Replaces deprecated unescape() with a spec-compliant equivalent.
  return btoa(
    encodeURIComponent(value).replace(/%([0-9A-F]{2})/gi, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    )
  );
}

function makeRandomB64(size: number): string {
  const buf = new Uint8Array(size);
  crypto.getRandomValues(buf);
  let binary = "";
  for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
  return btoa(binary);
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
  const sfuManagerRef = useRef<SfuMediaManager | null>(null);
  const sfuRouterRtpCapabilitiesRef = useRef<RtpCapabilities | null>(null);
  const callsWsCallIdRef = useRef<string | null>(null);
  const callsWsRoomRef = useRef<string | null>(null);
  const callsWsMediaRoomRef = useRef<string | null>(null);
  const callsWsSendTransportRef = useRef<string | null>(null);
  const callsWsRecvTransportRef = useRef<string | null>(null);
  const rekeyTimerRef = useRef<number | null>(null);
  const e2eeEpochRef = useRef<number>(0);
  const e2eeLeaderDeviceRef = useRef<string | null>(null);
  const keyPackageNonceRef = useRef<Set<string>>(new Set());
  const callKeyExchangeRef = useRef<CallKeyExchange | null>(null);
  const callMediaEncryptionRef = useRef<CallMediaEncryption | null>(null);
  const rekeyMachineRef = useRef<RekeyStateMachine | null>(null);
  const epochGuardRef = useRef<EpochGuard | null>(null);
  
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
  } = useVideoCallSfu({
    onCallEnded: (call) => {
      console.log("[VideoCallContext] Call ended:", call.id.slice(0, 8));
      if (callsWsCallIdRef.current === call.id) {
        callsWsCallIdRef.current = null;
        callsWsRoomRef.current = null;
        callsWsMediaRoomRef.current = null;
        callsWsSendTransportRef.current = null;
        callsWsRecvTransportRef.current = null;
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
    if (sfuManagerRef.current) {
      sfuManagerRef.current.close();
      sfuManagerRef.current = null;
    }
    sfuRouterRtpCapabilitiesRef.current = null;
    // Destroy E2EE key material and media encryption transforms
    callKeyExchangeRef.current?.destroy();
    callKeyExchangeRef.current = null;
    callMediaEncryptionRef.current?.destroy();
    callMediaEncryptionRef.current = null;
    // Destroy rekey state machine + epoch guard
    rekeyMachineRef.current?.destroy();
    rekeyMachineRef.current = null;
    epochGuardRef.current?.markRoomLeft();
    epochGuardRef.current = null;
    if (!callsWsRef.current) return;
    callsWsRef.current.close();
    callsWsRef.current = null;
    callsWsCallIdRef.current = null;
    callsWsRoomRef.current = null;
    callsWsMediaRoomRef.current = null;
    callsWsSendTransportRef.current = null;
    callsWsRecvTransportRef.current = null;
    e2eeLeaderDeviceRef.current = null;
    keyPackageNonceRef.current.clear();
  }, []);

  const ensureCallsV2Connected = useCallback(async (): Promise<CallsWsClient | null> => {
    if (!CALLS_V2_ENABLED || !user) return null;
    if (!CALLS_V2_WS_URL && CALLS_V2_WS_URLS.length === 0) {
      console.warn("[VideoCallContext] calls-v2 disabled: no WS endpoint configured");
      return null;
    }
    if (callsWsRef.current) return callsWsRef.current;

    const rawEndpoints = CALLS_V2_WS_URLS.length > 0 ? CALLS_V2_WS_URLS : (CALLS_V2_WS_URL ? [CALLS_V2_WS_URL] : []);
    const endpoints = rawEndpoints
      .map(normalizeWsEndpoint)
      .filter((v, i, arr) => !!v && arr.indexOf(v) === i);
    if (endpoints.length === 0) {
      console.warn("[VideoCallContext] calls-v2 disabled: WS endpoints normalized to empty", { rawEndpoints });
      return null;
    }

    const requireWss = !import.meta.env.DEV && !endpoints.some(isLocalEndpoint);
    console.info("[VideoCallContext] calls-v2 connect:start", {
      endpointCount: endpoints.length,
      firstEndpoint: endpoints[0],
      requireWss,
    });
    const client = new CallsWsClient({
      url: endpoints[0],
      urls: endpoints,
      requireWss,
      heartbeatMs: 10_000,
      reconnect: { enabled: true, maxAttempts: 20, baseDelayMs: 500, maxDelayMs: 12_000 },
      ackRetry: { maxRetries: 1, retryDelayMs: 250 },
    });

    try {
      const offState = client.onConnectionStateChange((state) => {
        console.info("[VideoCallContext] calls-v2 ws-state", { state });
      });
      await client.connect();
      console.info("[VideoCallContext] calls-v2 connect:ok", { state: client.connectionState });

      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) {
        console.warn("[VideoCallContext] calls-v2 auth:skip no access token");
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
      console.info("[VideoCallContext] calls-v2 hello:ok", { deviceId });
      await client.auth({ accessToken });
      console.info("[VideoCallContext] calls-v2 auth:ok");
      await client.e2eeCaps({
        insertableStreams: hasInsertableStreamsSupport(),
        sframe: FRAME_E2EE_ADVERTISE_SFRAME && hasInsertableStreamsSupport(),
      });
      console.info("[VideoCallContext] calls-v2 e2ee_caps:ok");

      // Initialize CallKeyExchange + CallMediaEncryption for this WS session.
      // Re-initialize on each new connection (ephemeral keys per session).
      if (!callKeyExchangeRef.current) {
        const identity: CallIdentity = {
          userId: user.id,
          deviceId: getStableCallsDeviceId(),
          sessionId: crypto.randomUUID(),
        };
        const kx = new CallKeyExchange(identity);
        await kx.initialize();
        callKeyExchangeRef.current = kx;
        console.info("[VideoCallContext] calls-v2 CallKeyExchange initialized");
      }
      if (!callMediaEncryptionRef.current) {
        callMediaEncryptionRef.current = new CallMediaEncryption();
        console.info("[VideoCallContext] calls-v2 CallMediaEncryption initialized");
        }
  
        // Initialize RekeyStateMachine + EpochGuard for this WS session
        if (!rekeyMachineRef.current) {
          rekeyMachineRef.current = new RekeyStateMachine();
        }
        if (!epochGuardRef.current) {
          epochGuardRef.current = new EpochGuard(true); // strict: media blocked without E2EE
        }
        epochGuardRef.current.markAuthenticated();
  
        // Wire rekey state machine events
        rekeyMachineRef.current.onEvent((event: RekeyEvent) => {
          console.log(`[Rekey] ${event.type} epoch=${event.epoch}`, event.reason ?? '');
  
          if (event.type === 'QUORUM_REACHED') {
            // All active peers ACK'd → send REKEY_COMMIT to server
            const activeRoomId = callsWsRoomRef.current;
            if (activeRoomId) {
              void client.rekeyCommit({ roomId: activeRoomId, epoch: event.epoch }).catch((err) => {
                console.warn('[VideoCallContext] rekeyCommit failed', err);
              });
            }
          }
  
          if (event.type === 'REKEY_COMMITTED') {
            // Epoch activated — ungate media
            epochGuardRef.current?.markE2eeReady(event.epoch);
            if (event.epoch > e2eeEpochRef.current) {
              e2eeEpochRef.current = event.epoch;
            }
          }
  
          if (event.type === 'REKEY_ABORTED' || event.type === 'DEADLINE_EXCEEDED') {
            console.error(`[Rekey] Aborted epoch=${event.epoch}: ${event.reason}`);
            // Keep current epoch active; do NOT advance guard
          }
        });
  
        client.on("AUTH_FAIL", (frame) => {
        console.warn("[VideoCallContext] calls-v2 auth-fail", { payload: frame.payload });
      });

      client.on("ERROR", (frame) => {
        console.warn("[VideoCallContext] calls-v2 server-error", {
          type: frame.type,
          payload: frame.payload,
          ack: frame.ack,
        });
      });

      client.on("ROOM_LEFT", (frame) => {
        console.warn("[VideoCallContext] calls-v2 room-left", { payload: frame.payload });
      });

      // SECURITY FIX: Unsubscribe connection state handler after setup to prevent
      // handler accumulation across re-renders and potential memory/event-listener leaks.
      offState();

      client.on("ROOM_SNAPSHOT", (frame) => {
        const snapshot = frame.payload as any;
        const leader = snapshot?.e2ee?.leaderDeviceId;
        if (typeof leader === "string" && leader.length > 0) {
          e2eeLeaderDeviceRef.current = leader;
        }
        // Populate rekey machine with current room peers
        if (Array.isArray(snapshot?.peers)) {
          const peerIds: string[] = (snapshot.peers as Array<{ peerId?: string; deviceId?: string }>)
            .map((p) => p.peerId ?? p.deviceId ?? '')
            .filter(Boolean);
          rekeyMachineRef.current?.setActivePeers(peerIds);
        }
      });

      client.on("REKEY_BEGIN", (frame) => {
        const activeRoomId = callsWsRoomRef.current;
        const roomId = frame.payload?.roomId as string | undefined;
        if (!activeRoomId || !roomId || roomId !== activeRoomId) return;

        const epochRaw = frame.payload?.epoch;
        const epoch = typeof epochRaw === "number" ? epochRaw : Number(epochRaw);
        if (!Number.isFinite(epoch) || epoch < 0) return;

        const myDeviceId = getStableCallsDeviceId();
        const leaderDeviceId = e2eeLeaderDeviceRef.current;
        if (!leaderDeviceId || leaderDeviceId === myDeviceId) return;

        const nonce = `${roomId}:${epoch}:${myDeviceId}`;
        if (keyPackageNonceRef.current.has(nonce)) return;
        keyPackageNonceRef.current.add(nonce);
        if (keyPackageNonceRef.current.size > 2000) {
          const keep = Array.from(keyPackageNonceRef.current).slice(-1000);
          keyPackageNonceRef.current = new Set(keep);
        }

        // Phase B: Real ECDH KEY_PACKAGE.
        // Non-leader creates own epoch key (for outbound SFrame encryption) and sends
        // its ECDH public key to the leader. Leader will respond with a KEY_PACKAGE
        // containing the epoch key wrapped with ECDH(leader_priv, our_pub).
        const keyExchange = callKeyExchangeRef.current;
        const mediaEncryption = callMediaEncryptionRef.current;

        if (!keyExchange || !mediaEncryption) {
          console.warn("[VideoCallContext] KEY_PACKAGE: key exchange not initialized, skipping");
          return;
        }

        void (async () => {
          try {
            // Create our epoch key (used for outbound SFrame until leader's epoch key arrives)
            const epochKey = await keyExchange.createEpochKey(epoch);
            await mediaEncryption.setEncryptionKey(epochKey);

            const senderPublicKey = await keyExchange.getPublicKeyBase64();

            // Phase B: we don't know leader's ECDH public key yet, so we can't wrap
            // for them. We send our senderPublicKey so the leader can ECDH back to us.
            // ciphertext = our senderPublicKey again (discovery packet; no epoch key wrapped yet).
            // Leader on receipt will createKeyPackage(our_pub, epoch) and send back wrapped epoch key.
            void client.keyPackage({
              roomId,
              targetDeviceId: leaderDeviceId,
              epoch,
              ciphertext: senderPublicKey, // discovery: our public key as payload
              sig: makeRandomB64(64),       // TODO Phase C: real ECDSA identity binding
              senderPublicKey,
            }).catch((error) => {
              console.warn("[VideoCallContext] KEY_PACKAGE send failed", error);
            });

            console.info("[VideoCallContext] KEY_PACKAGE sent (Phase B ECDH discovery)", { epoch, roomId });
          } catch (err) {
            console.warn("[VideoCallContext] KEY_PACKAGE async error", err);
          }
        })();
      });

      client.on("KEY_PACKAGE", (frame) => {
        const activeRoomId = callsWsRoomRef.current;
        const roomId = frame.payload?.roomId as string | undefined;
        if (!activeRoomId || !roomId || roomId !== activeRoomId) return;

        const myDeviceId = getStableCallsDeviceId();
        const targetDeviceId = frame.payload?.targetDeviceId as string | undefined;
        if (!targetDeviceId || targetDeviceId !== myDeviceId) return;

        const epochRaw = frame.payload?.epoch;
        const epoch = typeof epochRaw === "number" ? epochRaw : Number(epochRaw);
        if (!Number.isFinite(epoch) || epoch < 0) return;

        // Phase C: Anti-replay + epoch gating via RekeyStateMachine
        const msgId = (frame.payload as Record<string, unknown> | undefined)?.messageId as string | undefined;
        const isValidPkg = rekeyMachineRef.current?.validateKeyPackage(epoch, msgId);
        if (isValidPkg === false) {
          console.warn("[VideoCallContext] KEY_PACKAGE rejected: anti-replay or stale epoch", { epoch, msgId });
          return;
        }

        const keyExchange = callKeyExchangeRef.current;
        const mediaEncryption = callMediaEncryptionRef.current;

        void (async () => {
          try {
            const rawPayload = frame.payload as Record<string, unknown> | undefined;
            const senderPublicKeyB64 = rawPayload?.senderPublicKey as string | undefined;
            const ciphertextB64 = rawPayload?.ciphertext as string | undefined;
            const sigB64 = rawPayload?.sig as string | undefined;

            if (keyExchange && mediaEncryption && senderPublicKeyB64 && ciphertextB64) {
              // Determine sender identity from whatever the frame provides
              const senderUserId = rawPayload?.fromUserId as string | undefined
                ?? rawPayload?.fromDeviceId as string | undefined
                ?? 'unknown';
              const senderDeviceId = rawPayload?.fromDeviceId as string | undefined ?? '';

              const pkgData: KeyPackageData = {
                senderPublicKey: senderPublicKeyB64,
                ciphertext: ciphertextB64,
                sig: sigB64 ?? makeRandomB64(64),
                epoch,
                // salt: required by KeyPackageData; extract from payload or use empty string
                // (processKeyPackage will reject if signature doesn't match due to wrong salt)
                salt: (rawPayload?.salt as string | undefined) ?? '',
                senderIdentity: {
                  userId: senderUserId,
                  deviceId: senderDeviceId,
                  sessionId: '',
                },
              };

              // Try full ECDH unwrap (real wrapped epoch key from leader)
              try {
                const peerEpochKey = await keyExchange.processKeyPackage(pkgData);
                await mediaEncryption.setDecryptionKey(senderUserId, peerEpochKey);
                console.info("[VideoCallContext] KEY_PACKAGE: processKeyPackage OK", { epoch, senderUserId });
              } catch {
                // Sender sent discovery packet (ciphertext = their public key, not wrapped epoch key).
                // If we are the leader → create epoch key and respond with wrapped KEY_PACKAGE.
                const leaderDeviceId = e2eeLeaderDeviceRef.current;
                if (leaderDeviceId === myDeviceId && senderDeviceId) {
                  console.info("[VideoCallContext] KEY_PACKAGE: leader responding with wrapped epoch key", { epoch, senderDeviceId });
                  void (async () => {
                    try {
                      // Get or create epoch key for this epoch
                      const epochKey = keyExchange.getCurrentEpochKey()?.epoch === epoch
                        ? keyExchange.getCurrentEpochKey()!
                        : await keyExchange.createEpochKey(epoch);
                      await mediaEncryption.setEncryptionKey(epochKey);

                      // createKeyPackage uses ECDH with sender's public key
                      const pkg = await keyExchange.createKeyPackage(senderPublicKeyB64, epoch);
                      void client.keyPackage({
                        roomId,
                        targetDeviceId: senderDeviceId,
                        epoch,
                        ciphertext: pkg.ciphertext,
                        sig: pkg.sig,
                        senderPublicKey: pkg.senderPublicKey,
                      }).catch((err) => {
                        console.warn("[VideoCallContext] leader KEY_PACKAGE response failed", err);
                      });
                    } catch (e2) {
                      console.warn("[VideoCallContext] leader KEY_PACKAGE creation failed", e2);
                    }
                  })();
                }
              }
            }
          } finally {
            // Always send KEY_ACK regardless of key exchange outcome
            void client.keyAck({
              roomId,
              epoch,
              fromDeviceId: myDeviceId,
            }).catch((error) => {
              console.warn("[VideoCallContext] KEY_ACK send failed", error);
            });
          }
        })();
      });

      client.on("REKEY_COMMIT", (frame) => {
        const epochRaw = frame.payload?.epoch;
        const nextEpoch = typeof epochRaw === "number" ? epochRaw : Number(epochRaw);
        if (!Number.isFinite(nextEpoch)) return;
        // Desync guard: never move backward.
        if (nextEpoch > e2eeEpochRef.current) {
          e2eeEpochRef.current = nextEpoch;
          // Activate epoch in state machine (if we're the initiator)
          rekeyMachineRef.current?.activateEpoch(nextEpoch);
          // Ungate media for new epoch
          epochGuardRef.current?.markE2eeReady(nextEpoch);
          const activeRoomId = callsWsRoomRef.current;
          if (activeRoomId) {
            void client.e2eeReady({ roomId: activeRoomId, epoch: nextEpoch }).catch((err) => {
              console.warn("[VideoCallContext] E2EE_READY after REKEY_COMMIT failed", err);
            });
          }
        }
      });

      client.on("PEER_JOINED", (frame) => {
        const peerId = (frame.payload as Record<string, unknown> | undefined)?.peerId as string | undefined;
        if (peerId) {
          rekeyMachineRef.current?.addPeer(peerId);
        }
      });

      client.on("PEER_LEFT", (frame) => {
        const peerId = (frame.payload as Record<string, unknown> | undefined)?.peerId as string | undefined;
        if (peerId) {
          rekeyMachineRef.current?.removePeer(peerId);
        }
      });

      client.on("KEY_ACK", (frame) => {
        const payload = frame.payload as Record<string, unknown> | undefined;
        const fromDeviceId = payload?.fromDeviceId as string | undefined;
        const epochRaw = payload?.epoch;
        const epoch = typeof epochRaw === "number" ? epochRaw : Number(epochRaw ?? 0);
        const msgId = payload?.messageId as string | undefined;
        if (fromDeviceId && Number.isFinite(epoch)) {
          rekeyMachineRef.current?.onKeyAckReceived(fromDeviceId, epoch, msgId);
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
      if (!CALLS_V2_ENABLED || !user) return;
      if (!CALLS_V2_WS_URL && CALLS_V2_WS_URLS.length === 0) return;

      const callId = call.id;
      if (callsWsCallIdRef.current === callId && callsWsRoomRef.current) return;
      console.info("[VideoCallContext] calls-v2 room-bootstrap:start", { callId, role });

      const client = await ensureCallsV2Connected();
      if (!client) return;

      try {
        let roomId: string;
        let joinToken: string | undefined;

        if (role === "caller") {
          await client.roomCreate({
            callId,
            preferredRegion: "tr",
          });
          console.info("[VideoCallContext] calls-v2 room-create:sent", { callId });

          const createdFrame = await client.waitFor(
            "ROOM_CREATED",
            (frame) => typeof frame.payload?.roomId === "string" && frame.payload?.roomId.length > 0,
            { timeoutMs: 5000, acceptRecent: true }
          );
          roomId = createdFrame.payload?.roomId as string;
          console.info("[VideoCallContext] calls-v2 room-created:ok", { callId, roomId });

          const secretFrame = await client.waitFor(
            "ROOM_JOIN_SECRET",
            (frame) => frame.payload?.roomId === roomId && typeof frame.payload?.joinToken === "string" && frame.payload?.joinToken.length > 0,
            { timeoutMs: 5000, acceptRecent: true }
          );
          joinToken = secretFrame.payload?.joinToken as string;
          console.info("[VideoCallContext] calls-v2 room-join-secret:ok", { roomId });
        } else {
          const hintedRoomId = (call as VideoCall & { room_id?: string; calls_v2_room_id?: string }).calls_v2_room_id
            ?? (call as VideoCall & { room_id?: string }).room_id;
          const hintedJoinToken = (call as VideoCall & { join_token?: string; calls_v2_join_token?: string }).calls_v2_join_token
            ?? (call as VideoCall & { join_token?: string }).join_token;

          if (!hintedRoomId || !hintedJoinToken) {
            console.warn("[VideoCallContext] calls-v2 callee bootstrap skipped: missing room/join token", {
              callId,
              hasRoomId: !!hintedRoomId,
              hasJoinToken: !!hintedJoinToken,
            });
            return;
          }

          roomId = hintedRoomId;
          joinToken = hintedJoinToken;
          console.info("[VideoCallContext] calls-v2 callee-room-hint:ok", {
            callId,
            roomId,
            hasJoinToken: !!joinToken,
          });
        }

        await client.roomJoin({
          roomId,
          joinToken,
          deviceId: getStableCallsDeviceId(),
          preferredRegion: "tr",
        });
        console.info("[VideoCallContext] calls-v2 room-join:ok", { callId, roomId, role });
        e2eeEpochRef.current = 0;
        // Inform epoch guard that we have joined
        epochGuardRef.current?.markRoomJoined(0);
        await client.e2eeReady({ roomId, epoch: 0 });
        epochGuardRef.current?.markE2eeReady(0);
        console.info("[VideoCallContext] calls-v2 e2ee-ready:ok", { roomId, epoch: 0 });

        // Capture routerRtpCapabilities from ROOM_JOINED for SFU Device loading
        const joinedUnsub = client.on("ROOM_JOINED", (frame) => {
          const payload = frame.payload as { roomId?: string; routerRtpCapabilities?: RtpCapabilities } | undefined;
          if (payload?.roomId !== roomId) return;
          if (payload?.routerRtpCapabilities) {
            sfuRouterRtpCapabilitiesRef.current = payload.routerRtpCapabilities;
            console.info("[VideoCallContext] calls-v2 routerRtpCapabilities captured", { roomId });
          }
          joinedUnsub();
        });

        const consumeUnsub = client.on("PRODUCER_ADDED", (frame) => {
          const payload = frame.payload as { roomId?: string; producerId?: string } | undefined;
          if (payload?.roomId !== roomId) return;
          const producerId = payload?.producerId;
          if (!producerId) return;
          // Use SFU device rtpCapabilities if loaded, else router capabilities
          const rtpCapabilities =
            sfuManagerRef.current?.rtpCapabilities ??
            sfuRouterRtpCapabilitiesRef.current;
          if (!rtpCapabilities) {
            console.warn("[VideoCallContext] calls-v2 consume skipped: rtpCapabilities not ready", { roomId, producerId });
            return;
          }
          void client.consume({ roomId, producerId, rtpCapabilities }).catch((err) => {
            console.warn("[VideoCallContext] calls-v2 consume failed", err);
          });
        });

        setTimeout(() => {
          consumeUnsub();
        }, 10 * 60_000);

        callsWsCallIdRef.current = callId;
        callsWsRoomRef.current = roomId;
        console.info("[VideoCallContext] calls-v2 room-bootstrap:done", { callId, roomId });

        if (rekeyTimerRef.current) {
          window.clearInterval(rekeyTimerRef.current);
          rekeyTimerRef.current = null;
        }

        // Phase C: State machine-driven rekey.
        // Timer only initiates; actual commit happens on QUORUM_REACHED event.
        rekeyTimerRef.current = window.setInterval(() => {
          const activeClient = callsWsRef.current;
          const activeRoomId = callsWsRoomRef.current;
          const machine = rekeyMachineRef.current;
          const keyExchange = callKeyExchangeRef.current;
          if (!activeClient || !activeRoomId || !machine || !keyExchange) return;

          const newEpoch = machine.initiateRekey();
          if (newEpoch === null) return; // blocked: wrong state or cooldown

          const mediaEncryption = callMediaEncryptionRef.current;

          // Advance epoch guard (disables media during key delivery)
          epochGuardRef.current?.markEpochAdvanced(newEpoch);

          void (async () => {
            try {
              const epochKey = await keyExchange.createEpochKey(newEpoch);
              if (mediaEncryption) await mediaEncryption.setEncryptionKey(epochKey);

              await activeClient.rekeyBegin({ roomId: activeRoomId, epoch: newEpoch });
              // Transition machine to KEY_DELIVERY; starts deadline timer
              machine.onRekeyBeginAcked(newEpoch);
              console.info("[VideoCallContext] calls-v2 rekey:begin sent", { epoch: newEpoch });
            } catch (err) {
              console.error("[VideoCallContext] calls-v2 rekey:begin failed, aborting", err);
              machine.abortRekey(String(err));
              // Restore previous epoch in guard on abort
              epochGuardRef.current?.markE2eeReady(e2eeEpochRef.current);
            }
          })();
        }, REKEY_INTERVAL_MS);
      } catch (err) {
        console.warn("[VideoCallContext] calls-v2 room bootstrap failed", err);
      }
    },
    [ensureCallsV2Connected, user]
  );

  const bootstrapCallsV2Media = useCallback(
    async (call: VideoCall, stream: MediaStream | null) => {
      if (!CALLS_V2_ENABLED || !user || !stream) return;
      if (!CALLS_V2_WS_URL && CALLS_V2_WS_URLS.length === 0) return;
      const callId = call.id;
      const hintedRoomId = (call as VideoCall & { room_id?: string; calls_v2_room_id?: string }).calls_v2_room_id
        ?? (call as VideoCall & { room_id?: string }).room_id;
      const roomId = callsWsCallIdRef.current === callId
        ? callsWsRoomRef.current
        : (hintedRoomId ?? null);

      if (!roomId) {
        console.warn("[VideoCallContext] calls-v2 media-bootstrap skipped: room unresolved", {
          callId,
          mappedCallId: callsWsCallIdRef.current,
          mappedRoomId: callsWsRoomRef.current,
          hintedRoomId,
        });
        return;
      }

      if (callsWsRoomRef.current !== roomId) return;
      if (callsWsMediaRoomRef.current === roomId) return;

      const client = callsWsRef.current ?? (await ensureCallsV2Connected());
      if (!client) return;

      try {
        console.info("[VideoCallContext] calls-v2 media-bootstrap:start", { callId, roomId });

        // Phase C: Fail-closed epoch guard — no media without E2EE_READY
        try {
          epochGuardRef.current?.assertMediaAllowed('PRODUCE');
        } catch (e) {
          console.error('[VideoCallContext] [EpochGuard] Cannot bootstrap media:', e);
          return;
        }

        // --- SFU Device initialization ---
        const routerRtpCapabilities = sfuRouterRtpCapabilitiesRef.current;
        if (!routerRtpCapabilities) {
          console.warn("[VideoCallContext] calls-v2 media-bootstrap skipped: routerRtpCapabilities not ready. Waiting for ROOM_JOINED event.", { roomId });
          return;
        }

        // Lazy-init SfuMediaManager per call session
        if (!sfuManagerRef.current) {
          sfuManagerRef.current = new SfuMediaManager();
        }
        const sfuManager = sfuManagerRef.current;
        // cast: our RtpCapabilities is structurally compatible with mediasoup-client RtpCapabilities
        await sfuManager.loadDevice(routerRtpCapabilities as import('mediasoup-client').types.RtpCapabilities);

        // --- Send Transport ---
        await client.transportCreate({ roomId, direction: "send" });
        const sendCreated = await client.waitFor(
          "TRANSPORT_CREATED",
          (frame) => {
            const p = frame.payload as { roomId?: string; direction?: string } | undefined;
            return p?.roomId === roomId && p?.direction === "send";
          },
          { timeoutMs: 5000, acceptRecent: true }
        );
        const sendParams = sendCreated.payload as import('@/calls-v2/types').TransportCreatedPayload | undefined;
        if (!sendParams?.transportId) return;
        console.info("[VideoCallContext] calls-v2 transport-created:send", { roomId, transportId: sendParams.transportId });

        sfuManager.createSendTransport(
          {
            id: sendParams.transportId,
            iceParameters: sendParams.iceParameters as import('mediasoup-client').types.IceParameters,
            iceCandidates: sendParams.iceCandidates as import('mediasoup-client').types.IceCandidate[],
            dtlsParameters: sendParams.dtlsParameters as import('mediasoup-client').types.DtlsParameters,
          },
          async (dtlsParameters) => {
            await client.transportConnect({
              roomId,
              transportId: sendParams.transportId,
              dtlsParameters: dtlsParameters as import('@/calls-v2/types').DtlsParameters,
            });
            console.info("[VideoCallContext] calls-v2 transport-connect:send:ok", { roomId });
          },
          async ({ kind, rtpParameters, appData }) => {
            await client.produce({
              roomId,
              transportId: sendParams.transportId,
              kind,
              rtpParameters: rtpParameters as import('@/calls-v2/types').RtpParameters,
              appData: appData as Record<string, unknown>,
            });
            const producedFrame = await client.waitFor(
              "PRODUCED",
              (frame) => {
                const p = frame.payload as { roomId?: string; producerId?: string } | undefined;
                return p?.roomId === roomId && typeof p?.producerId === "string";
              },
              { timeoutMs: 5000, acceptRecent: true }
            );
            const producerId = (producedFrame.payload as { producerId?: string })?.producerId;
            if (!producerId) throw new Error("PRODUCED event missing producerId");
            console.info("[VideoCallContext] calls-v2 produce:ok", { roomId, kind, producerId });
            return producerId;
          }
        );
        callsWsSendTransportRef.current = sendParams.transportId;

        // --- Recv Transport ---
        await client.transportCreate({ roomId, direction: "recv" });
        const recvCreated = await client.waitFor(
          "TRANSPORT_CREATED",
          (frame) => {
            const p = frame.payload as { roomId?: string; direction?: string } | undefined;
            return p?.roomId === roomId && p?.direction === "recv";
          },
          { timeoutMs: 5000, acceptRecent: true }
        );
        const recvParams = recvCreated.payload as import('@/calls-v2/types').TransportCreatedPayload | undefined;
        if (!recvParams?.transportId) return;
        console.info("[VideoCallContext] calls-v2 transport-created:recv", { roomId, transportId: recvParams.transportId });

        sfuManager.createRecvTransport(
          {
            id: recvParams.transportId,
            iceParameters: recvParams.iceParameters as import('mediasoup-client').types.IceParameters,
            iceCandidates: recvParams.iceCandidates as import('mediasoup-client').types.IceCandidate[],
            dtlsParameters: recvParams.dtlsParameters as import('mediasoup-client').types.DtlsParameters,
          },
          async (dtlsParameters) => {
            await client.transportConnect({
              roomId,
              transportId: recvParams.transportId,
              dtlsParameters: dtlsParameters as import('@/calls-v2/types').DtlsParameters,
            });
            console.info("[VideoCallContext] calls-v2 transport-connect:recv:ok", { roomId });
          }
        );
        callsWsRecvTransportRef.current = recvParams.transportId;

        // Subscribe to CONSUMED events and create consumers + attach SFrame receiver transforms
        client.on("CONSUMED", (frame) => {
          const p = frame.payload as import('@/calls-v2/types').ConsumedPayload | undefined;
          if (!p || p.roomId !== roomId) return;
          void sfuManager.consume({
            id: p.consumerId,
            producerId: p.producerId,
            kind: p.kind as import('mediasoup-client').types.MediaKind,
            rtpParameters: p.rtpParameters as import('mediasoup-client').types.RtpParameters,
          }).then((consumer) => {
            console.info("[VideoCallContext] calls-v2 consumer:created", { roomId, consumerId: consumer.id, kind: consumer.kind });
            // Attach E2EE receiver transform (Insertable Streams) — fail-closed: frames dropped without key
            if (CallMediaEncryption.isSupported()) {
              const receiver = sfuManagerRef.current?.getConsumerReceiver(consumer.id);
              if (receiver) {
                // Use producerId as peerId — links to who created this producer
                callMediaEncryptionRef.current?.setupReceiverTransform(receiver, p.producerId, consumer.id);
              }
            }
            return client.consumerResume({ roomId, consumerId: consumer.id });
          }).catch((err) => {
            console.warn("[VideoCallContext] calls-v2 consume/resume failed", err);
          });
        });

        // Produce all live local tracks + attach SFrame sender transforms
        const tracks = stream.getTracks().filter((track) => track.readyState === "live");
        for (const track of tracks) {
          const producer = await sfuManager.produce(track, { trackId: track.id });
          // Attach E2EE sender transform after produce (Insertable Streams)
          if (CallMediaEncryption.isSupported()) {
            const sender = sfuManagerRef.current?.getProducerSender(producer.id);
            if (sender) {
              callMediaEncryptionRef.current?.setupSenderTransform(sender, producer.id);
            }
          }
        }

        callsWsMediaRoomRef.current = roomId;
        console.info("[VideoCallContext] calls-v2 media-bootstrap:done", { roomId, trackCount: tracks.length });
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
        console.log("[VideoCallContext] Ignoring native end/disconnect action to avoid false DB ended status", {
          callId: action.callId,
          actionType,
          status,
          connectionState,
        });
        return;
      }
    });
  }, [pendingIncomingCall, incomingCall, currentCall, answerCall, declineCall, status, connectionState]);

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
