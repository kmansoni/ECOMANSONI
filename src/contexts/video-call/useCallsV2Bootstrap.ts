import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { logger } from "@/lib/logger";
import { supabase } from "@/integrations/supabase/client";
import { getStableCallsDeviceId } from "@/lib/platform/device";
import { CallsWsClient } from "@/calls-v2/wsClient";
import { SfuMediaManager } from "@/calls-v2/sfuMediaManager";
import { CallKeyExchange } from "@/calls-v2/callKeyExchange";
import { CallMediaEncryption } from "@/calls-v2/callMediaEncryption";
import { RekeyStateMachine } from "@/calls-v2/rekeyStateMachine";
import { EpochGuard } from "@/calls-v2/epochGuard";
import type { RtpCapabilities } from "@/calls-v2/types";
import type { VideoCall } from "@/hooks/useVideoCallSfu";
import type { PipeBreakInfo } from "@/lib/e2ee/insertableStreams";
import {
  CALLS_V2_ENABLED,
  CALLS_V2_ENDPOINTS,
  REKEY_INTERVAL_MS,
  REQUIRE_SFRAME,
  FRAME_E2EE_ADVERTISE_SFRAME,
  hasE2eeSupport,
  hasInsertableStreamsSupport,
  extractRouterCapsFromJoinPayload,
  canSendE2eeReady,
} from "./videoCallProvider.helpers";
import { useCallsV2E2eeBootstrap } from "./useCallsV2E2eeBootstrap";

type UserLike = { id: string } | null;

interface UseCallsV2BootstrapParams {
  user: UserLike;
  fetchTurnIceServers: () => Promise<RTCIceServer[] | null>;
  setPendingIncomingCall: Dispatch<SetStateAction<VideoCall | null>>;
  callsWsRef: MutableRefObject<CallsWsClient | null>;
  connectingPromiseRef: MutableRefObject<Promise<CallsWsClient | null> | null>;
  sfuManagerRef: MutableRefObject<SfuMediaManager | null>;
  sfuRouterRtpCapabilitiesRef: MutableRefObject<RtpCapabilities | null>;
  callsWsCallIdRef: MutableRefObject<string | null>;
  callsWsRoomRef: MutableRefObject<string | null>;
  lastSnapshotRoomVersionRef: MutableRefObject<number>;
  callsWsMediaRoomRef: MutableRefObject<string | null>;
  callsWsMediaBootstrapInFlightRoomRef: MutableRefObject<string | null>;
  callsWsSendTransportRef: MutableRefObject<string | null>;
  callsWsRecvTransportRef: MutableRefObject<string | null>;
  rekeyTimerRef: MutableRefObject<number | null>;
  e2eeEpochRef: MutableRefObject<number>;
  turnIceServersRef: MutableRefObject<RTCIceServer[] | null>;
  e2eeLeaderDeviceRef: MutableRefObject<string | null>;
  keyPackageNonceRef: MutableRefObject<Set<string>>;
  keyPackageNonceTimestampsRef: MutableRefObject<Map<string, number>>;
  callKeyExchangeRef: MutableRefObject<CallKeyExchange | null>;
  callMediaEncryptionRef: MutableRefObject<CallMediaEncryption | null>;
  rekeyMachineRef: MutableRefObject<RekeyStateMachine | null>;
  epochGuardRef: MutableRefObject<EpochGuard | null>;
  lastCallsBootstrapErrorRef: MutableRefObject<Error | null>;
  producerPeerKeyRef: MutableRefObject<Map<string, string>>;
  peerUserIdByDeviceIdRef: MutableRefObject<Map<string, string>>;
  pendingProducersToConsumeRef: MutableRefObject<Map<string, { roomId: string; peerDeviceId?: string; peerUserId?: string }>>;
  consumePendingProducersRef: MutableRefObject<(() => void) | null>;
  handleE2eePipeBreakRef: MutableRefObject<((info: PipeBreakInfo) => void) | null>;
  producerAddedUnsubRef: MutableRefObject<(() => void) | null>;
  isCallStillActiveForBootstrap: (callId: string) => boolean;
  onE2eeActivated?: () => void;
  onDecryptionKeyReady?: (peerKey: string) => void;
  hasInboundE2eeReadiness?: () => boolean;
  getInboundE2eeReadiness?: () => { ready: boolean; missingDecryptionPeers: string[]; pendingConsumers: string[] };
  missingSenderKeysRef?: MutableRefObject<Set<string>>;
}

const CALLS_V2_PREFERRED_REGION = String(import.meta.env.VITE_CALLS_V2_PREFERRED_REGION ?? "ru")
  .trim()
  .toLowerCase();

function prioritizeEndpointsByRegion(endpoints: string[], region: string): string[] {
  if (!region) return endpoints;

  const regionToken = `sfu-${region.toLowerCase()}.`;
  const preferred = endpoints.filter((endpoint) => endpoint.toLowerCase().includes(regionToken));
  if (preferred.length === 0) return endpoints;

  const preferredSet = new Set(preferred);
  const rest = endpoints.filter((endpoint) => !preferredSet.has(endpoint));
  return [...preferred, ...rest];
}

export function useCallsV2Bootstrap({
  user,
  fetchTurnIceServers,
  setPendingIncomingCall,
  callsWsRef,
  connectingPromiseRef,
  sfuManagerRef,
  sfuRouterRtpCapabilitiesRef,
  callsWsCallIdRef,
  callsWsRoomRef,
  lastSnapshotRoomVersionRef,
  callsWsMediaRoomRef,
  callsWsMediaBootstrapInFlightRoomRef,
  callsWsSendTransportRef,
  callsWsRecvTransportRef,
  rekeyTimerRef,
  e2eeEpochRef,
  turnIceServersRef,
  e2eeLeaderDeviceRef,
  keyPackageNonceRef,
  keyPackageNonceTimestampsRef,
  callKeyExchangeRef,
  callMediaEncryptionRef,
  rekeyMachineRef,
  epochGuardRef,
  lastCallsBootstrapErrorRef,
  producerPeerKeyRef,
  peerUserIdByDeviceIdRef,
  pendingProducersToConsumeRef,
  consumePendingProducersRef,
  handleE2eePipeBreakRef,
  producerAddedUnsubRef,
  isCallStillActiveForBootstrap,
  onE2eeActivated,
  onDecryptionKeyReady,
  hasInboundE2eeReadiness,
  getInboundE2eeReadiness,
  missingSenderKeysRef,
}: UseCallsV2BootstrapParams) {
  const { initializeCallsV2E2ee } = useCallsV2E2eeBootstrap({
    user,
    callsWsRef,
    callsWsRoomRef,
    lastSnapshotRoomVersionRef,
    e2eeEpochRef,
    e2eeLeaderDeviceRef,
    keyPackageNonceRef,
    keyPackageNonceTimestampsRef,
    callKeyExchangeRef,
    callMediaEncryptionRef,
    rekeyMachineRef,
    epochGuardRef,
    producerPeerKeyRef,
    peerUserIdByDeviceIdRef,
    sfuManagerRef,
    sfuRouterRtpCapabilitiesRef,
    pendingProducersToConsumeRef,
    consumePendingProducersRef,
    handleE2eePipeBreakRef,
    onE2eeActivated,
    onDecryptionKeyReady,
    hasInboundE2eeReadiness,
    getInboundE2eeReadiness,
    missingSenderKeysRef,
  });

  const ensureCallsV2Connected = useCallback((): Promise<CallsWsClient | null> => {
    if (!CALLS_V2_ENABLED || !user) return Promise.resolve(null);
    if (CALLS_V2_ENDPOINTS.length === 0) {
      logger.error("[VideoCallContext] CALLS_V2_CONFIG_MISSING", {
        host: typeof window !== "undefined" ? window.location.hostname : "unknown",
        envHasUrls: false,
        prodDefaultsEnabled: false,
      });
      return Promise.resolve(null);
    }

    // Fast path: already connected.
    if (callsWsRef.current?.connectionState === "connected") {
      return Promise.resolve(callsWsRef.current);
    }

    // Single-flight: if a connect is already in progress, share it.
    if (connectingPromiseRef.current) {
      return connectingPromiseRef.current;
    }

    const promise = (async (): Promise<CallsWsClient | null> => {
    // Discard any existing client that is no longer connected.
    if (callsWsRef.current) {
      const state = callsWsRef.current.connectionState;
      if (state === "connected") return callsWsRef.current;
      if (state === "connecting" || state === "reconnecting") {
        const becameConnected = await new Promise<boolean>((resolve) => {
          const timeoutId = window.setTimeout(() => { off(); resolve(false); }, 2500);
          const off = callsWsRef.current!.onConnectionStateChange((nextState) => {
            if (nextState !== "connected") return;
            window.clearTimeout(timeoutId);
            off();
            resolve(true);
          });
        });
        if (becameConnected && callsWsRef.current?.connectionState === "connected") {
          return callsWsRef.current;
        }
      }
      callsWsRef.current.close();
      callsWsRef.current = null;
    }

    const endpoints = prioritizeEndpointsByRegion(CALLS_V2_ENDPOINTS, CALLS_V2_PREFERRED_REGION);

    await fetchTurnIceServers();

    const requireWss = typeof window !== "undefined" ? window.location.protocol === "https:" : true;
    logger.info("[VideoCallContext] calls-v2 connect:start", {
      endpointCount: endpoints.length,
      firstEndpoint: endpoints[0],
      preferredRegion: CALLS_V2_PREFERRED_REGION,
      requireWss,
    });
    logger.info(`[VideoCallContext] calls-v2 first-endpoint=${endpoints[0] ?? "none"}`);
    const client = new CallsWsClient({
      url: endpoints[0],
      urls: endpoints,
      requireWss,
      heartbeatMs: 10_000,
      reconnect: { enabled: true, maxAttempts: 20, baseDelayMs: 500, maxDelayMs: 12_000 },
      ackRetry: { maxRetries: 1, retryDelayMs: 250 },
    });

    let offState: (() => void) | null = null;
    try {
      offState = client.onConnectionStateChange((state) => {
        logger.info("[VideoCallContext] calls-v2 ws-state", { state });
      });
      await client.connect();
      offState(); // P1-5 fix: unsubscribe after connect — state changes are logged by wsClient internally
      offState = null;
      logger.info("[VideoCallContext] calls-v2 connect:ok", { state: client.connectionState });

      const { data } = await supabase.auth.getSession();
      let accessToken = data.session?.access_token;
      if (!accessToken) {
        const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
        accessToken = refreshed.session?.access_token;
        if (refreshError) {
          logger.warn("[VideoCallContext] calls-v2 auth refresh failed", refreshError);
        }
      }
      if (!accessToken) {
        logger.warn("[VideoCallContext] calls-v2 auth:skip no access token");
        lastCallsBootstrapErrorRef.current = new Error("calls_v2_auth_missing_session: no access token");
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
      logger.info("[VideoCallContext] calls-v2 hello:ok", { deviceId });
      await client.auth({ accessToken });
      logger.info("[VideoCallContext] calls-v2 auth:ok");
      void client.syncMailbox({ deviceId: getStableCallsDeviceId(), lastStreamId: "0-0", limit: 100 }).catch((err) => {
        logger.warn("[VideoCallContext] calls-v2 mailbox sync after auth failed", { error: err instanceof Error ? err.message : String(err) });
      });
      const hasE2ee = hasE2eeSupport();
      const hasInsertableStreams = hasInsertableStreamsSupport();
      if (REQUIRE_SFRAME && !hasE2ee) {
        throw new Error("calls_v2_e2ee_media_unsupported: E2EE not supported — Web Crypto API required for SFrame");
      }
      // Some SFU deployments require E2EE_CAPS before ROOM_JOIN even in dev-mode.
      // Advertise runtime capabilities unconditionally to keep bootstrap protocol-compatible.
      await client.e2eeCaps({
        insertableStreams: hasInsertableStreams,
        sframe: hasE2ee,
        doubleRatchet: true,
        supportedCipherSuites: ["DOUBLE_RATCHET_P256_AES128GCM"],
      });
      logger.info("[VideoCallContext] calls-v2 e2ee_caps:ok", {
        hasE2ee,
        frameE2eeAdvertiseSframe: FRAME_E2EE_ADVERTISE_SFRAME,
        requireSframe: REQUIRE_SFRAME,
      });

      if (hasE2ee) {
        await initializeCallsV2E2ee(client);
      } else {
        logger.warn("[VideoCallContext] calls-v2 e2ee runtime unavailable: E2EE not supported in this browser");
      }

      client.on("call.invite", (frame) => {
        const p = (frame.payload ?? {}) as Record<string, unknown>;
        const callId = p.callId as string | undefined;
        const callType = (p.callType ?? p.call_type) as string | undefined;
        if (!callId) return;
        const syntheticCall: VideoCall & { calls_v2_room_id: string | null; calls_v2_join_token: string | null } = {
          id: callId,
          caller_id: (p.from as string | undefined) ?? "",
          callee_id: user?.id ?? "",
          conversation_id: (p.conversationId as string | undefined) ?? null,
          call_type: callType === "voice" ? "audio" : (callType === "video" ? "video" : "audio"),
          status: "ringing",
          created_at: new Date().toISOString(),
          started_at: null,
          ended_at: null,
          calls_v2_room_id: (p.callsV2RoomId as string | null | undefined) ?? null,
          calls_v2_join_token: (p.callsV2JoinToken as string | null | undefined) ?? null,
        };
        logger.info("[VideoCallContext] WS call.invite received", { callId: callId.slice(0, 8) });
        setPendingIncomingCall((prev) => {
          if (prev?.id === syntheticCall.id) {
            // Realtime may have delivered the call row before caller persisted roomId.
            // Upgrade the existing object if WS invite carries the missing room binding.
            const prevR = prev as typeof prev & { calls_v2_room_id?: string | null };
            const nextR = syntheticCall as typeof syntheticCall & { calls_v2_room_id?: string | null };
            if (!prevR.calls_v2_room_id && nextR.calls_v2_room_id) return syntheticCall;
            return prev;
          }
          if (prev) {
            logger.warn("[VideoCallContext] WS call.invite replacing pending call", {
              existingCallId: prev.id,
              incomingCallId: syntheticCall.id,
            });
          }
          return syntheticCall;
        });
      });

      callsWsRef.current = client;
      lastCallsBootstrapErrorRef.current = null;
      return client;
    } catch (err) {
      if (offState) {
        offState();
        offState = null;
      }
      logger.error("[VideoCallContext] calls-v2 connect/bootstrap failed", err);
      lastCallsBootstrapErrorRef.current = err instanceof Error ? err : new Error(String(err));
      client.close();
      return null;
    }
    })();

    connectingPromiseRef.current = promise;
    promise.finally(() => {
      connectingPromiseRef.current = null;
    });
    return promise;
  }, [
    callsWsRef,
    fetchTurnIceServers,
    lastCallsBootstrapErrorRef,
    initializeCallsV2E2ee,
    setPendingIncomingCall,
    user,
  ]);

  const bootstrapCallsV2Room = useCallback(
    async (call: VideoCall, role: "caller" | "callee") => {
      if (!CALLS_V2_ENABLED || !user) return false;
      if (CALLS_V2_ENDPOINTS.length === 0) return false;

      const callId = call.id;
      if (callsWsCallIdRef.current === callId && callsWsRoomRef.current) return true;
      logger.info("[VideoCallContext] calls-v2 room-bootstrap:start", { callId, role });

      const isStale = () => !isCallStillActiveForBootstrap(callId);
      if (isStale()) {
        logger.info("[VideoCallContext] calls-v2 room-bootstrap skipped: stale call", { callId, role });
        return false;
      }

      const client = await ensureCallsV2Connected();
      if (!client) return false;

      if (isStale()) {
        logger.info("[VideoCallContext] calls-v2 room-bootstrap aborted after connect: stale call", { callId, role });
        return false;
      }

      let roomId: string;
        let joinToken: string | undefined;
        let hintedRoomId: string | undefined;
        let hintedJoinToken: string | undefined;
        try {
          hintedRoomId = (call as VideoCall & { room_id?: string; calls_v2_room_id?: string }).calls_v2_room_id
            ?? (call as VideoCall & { room_id?: string }).room_id;
          hintedJoinToken = (call as VideoCall & { join_token?: string; calls_v2_join_token?: string }).calls_v2_join_token
            ?? (call as VideoCall & { join_token?: string }).join_token;

        if (role === "caller") {
          if (hintedRoomId) {
            roomId = hintedRoomId;
            joinToken = hintedJoinToken;
            logger.info("[VideoCallContext] calls-v2 caller-room-hint reused", {
              callId,
              roomId,
              hasJoinToken: !!joinToken,
            });
          } else {
            const allowedUserIds = [call.caller_id, call.callee_id].filter(
              (value, index, array): value is string => typeof value === "string" && value.length > 0 && array.indexOf(value) === index,
            );

            await client.roomCreate({
              callId,
              preferredRegion: CALLS_V2_PREFERRED_REGION,
              allowedUserIds,
            });
            logger.info("[VideoCallContext] calls-v2 room-create:sent", { callId });

            const createdFrame = await client.waitFor(
              "ROOM_CREATED",
              (frame) => {
                const payload = frame.payload as { roomId?: string } | undefined;
                return typeof payload?.roomId === "string" && payload.roomId.length > 0;
              },
              { timeoutMs: 5000, acceptRecent: true }
            );
            if (isStale()) {
              logger.info("[VideoCallContext] calls-v2 caller room ignored: stale call", { callId });
              return false;
            }
            roomId = (createdFrame.payload as { roomId?: string } | undefined)?.roomId as string;
            logger.info("[VideoCallContext] calls-v2 room-created:ok", { callId, roomId });

            try {
              const secretFrame = await client.waitFor(
                "ROOM_JOIN_SECRET",
                (frame) => {
                  const payload = frame.payload as { roomId?: string; joinToken?: string } | undefined;
                  return payload?.roomId === roomId && typeof payload?.joinToken === "string" && payload.joinToken.length > 0;
                },
                { timeoutMs: 1200, acceptRecent: true }
              );
              joinToken = (secretFrame.payload as { joinToken?: string } | undefined)?.joinToken as string;
              logger.info("[VideoCallContext] calls-v2 room-join-secret:ok", { roomId });
            } catch (error) {
              logger.warn("video_call_context.room_join_secret_wait_failed", { error, roomId });
              joinToken = undefined;
              logger.info("[VideoCallContext] calls-v2 room-join-secret:skip (sfu mode)", { roomId });
            }

            const { error: persistRoomError } = await supabase
              .from("video_calls")
              .update({
                calls_v2_room_id: roomId,
                calls_v2_join_token: joinToken ?? null,
              })
              .eq("id", callId);
            if (isStale()) {
              logger.info("[VideoCallContext] calls-v2 caller room persisted but not activated: stale call", { callId, roomId });
              return false;
            }
            if (persistRoomError) {
              logger.warn("[VideoCallContext] calls-v2 room hints persist failed", {
                callId,
                roomId,
                error: persistRoomError.message,
              });
            }

            // Preserve room hints in memory so retry path does not re-create rooms.
            (call as VideoCall & { calls_v2_room_id?: string | null; calls_v2_join_token?: string | null }).calls_v2_room_id = roomId;
            (call as VideoCall & { calls_v2_room_id?: string | null; calls_v2_join_token?: string | null }).calls_v2_join_token = joinToken ?? null;
          }
        } else {
          if (!hintedRoomId) {
            logger.warn("[VideoCallContext] calls-v2 callee bootstrap skipped: missing room/join token", {
              callId,
              hasRoomId: !!hintedRoomId,
              hasJoinToken: !!hintedJoinToken,
            });
            return false;
          }

          roomId = hintedRoomId;
          joinToken = hintedJoinToken;
          logger.info("[VideoCallContext] calls-v2 callee-room-hint:ok", {
            callId,
            roomId,
            hasJoinToken: !!joinToken,
          });
        }

        const roomJoinPayload = {
          roomId,
          joinToken,
          deviceId: getStableCallsDeviceId(),
          preferredRegion: CALLS_V2_PREFERRED_REGION,
        };

        try {
          await client.roomJoin(roomJoinPayload);
        } catch (roomJoinError) {
          // Some SFU deployments issue ROOM_JOIN_SECRET for callee only.
          // Caller should still be able to join its own room without token.
          if (role === "caller" && typeof joinToken === "string" && joinToken.length > 0) {
            logger.warn("[VideoCallContext] calls-v2 caller room-join with token failed; retrying without joinToken", {
              callId,
              roomId,
              error: roomJoinError instanceof Error ? roomJoinError.message : String(roomJoinError),
            });

            await client.roomJoin({
              roomId,
              deviceId: roomJoinPayload.deviceId,
              preferredRegion: roomJoinPayload.preferredRegion,
            });
          } else {
            throw roomJoinError;
          }
        }
        logger.info("[VideoCallContext] calls-v2 room-join:ok", { callId, roomId, role });
        const joinedFrame = await client.waitFor(
          "ROOM_JOIN_OK",
          (frame) => {
            const payload = frame.payload as { roomId?: string } | undefined;
            return payload?.roomId === roomId;
          },
          { timeoutMs: 5000, acceptRecent: true }
        );
        if (isStale()) {
          logger.info("[VideoCallContext] calls-v2 joined room ignored: stale call", { callId, roomId, role });
          return false;
        }
        const joinedPayload = joinedFrame.payload as Record<string, unknown> | undefined;
        const joinedEpochRaw = joinedPayload?.epoch;
        const joinedEpoch = typeof joinedEpochRaw === "number" ? joinedEpochRaw : Number(joinedEpochRaw ?? 0);
        if (Number.isFinite(joinedEpoch) && joinedEpoch >= 0) {
          e2eeEpochRef.current = joinedEpoch;
        } else {
          e2eeEpochRef.current = 0;
        }
        const joinCaps = extractRouterCapsFromJoinPayload(joinedPayload);
        if (joinCaps) {
          sfuRouterRtpCapabilitiesRef.current = joinCaps;
          logger.info("[VideoCallContext] calls-v2 routerRtpCapabilities captured from ROOM_JOIN_OK", { roomId });
        } else {
          throw new Error(
            `[calls-v2] FATAL protocol violation: ROOM_JOIN_OK missing routerRtpCapabilities (roomId=${roomId}, payloadKeys=${JSON.stringify(
              joinedPayload ? Object.keys(joinedPayload) : []
            )})`
          );
        }
        const joinedTurn = (joinedPayload as Record<string, unknown> | undefined)?.turn as { iceServers?: RTCIceServer[] } | undefined;
        if (Array.isArray(joinedTurn?.iceServers) && joinedTurn.iceServers.length > 0 && !turnIceServersRef.current?.length) {
          turnIceServersRef.current = joinedTurn.iceServers;
          logger.info("[VideoCallContext] calls-v2 TURN iceServers seeded from ROOM_JOIN_OK", { count: joinedTurn.iceServers.length });
        }
        epochGuardRef.current?.markRoomJoined(e2eeEpochRef.current);
        const initialReadiness = canSendE2eeReady({
          epoch: e2eeEpochRef.current,
          mediaEncryption: callMediaEncryptionRef.current,
          rekeyMachine: rekeyMachineRef.current,
          missingSenderKeys: missingSenderKeysRef?.current,
          inbound: getInboundE2eeReadiness?.() ?? (hasInboundE2eeReadiness ? { ready: hasInboundE2eeReadiness() } : null),
          requireQuorum: false,
        });
        if (initialReadiness.ready) {
          await client.e2eeReady({ roomId, epoch: e2eeEpochRef.current });
          epochGuardRef.current?.markE2eeReady(e2eeEpochRef.current);
          onE2eeActivated?.();
          logger.info("[VideoCallContext] calls-v2 e2ee-ready:ok", { roomId, epoch: e2eeEpochRef.current });
        } else {
          logger.warn("[VideoCallContext] calls-v2 E2EE_READY deferred after ROOM_JOIN_OK: gate is not satisfied", initialReadiness);
        }

        const joinedUnsub = client.on("ROOM_JOINED", (frame) => {
          const payload = frame.payload as { roomId?: string; routerRtpCapabilities?: RtpCapabilities; mediasoup?: { routerRtpCapabilities?: RtpCapabilities } } | undefined;
          if (payload?.roomId !== roomId) return;
          const caps = extractRouterCapsFromJoinPayload(payload);
          if (caps) {
            sfuRouterRtpCapabilitiesRef.current = caps;
            logger.info("[VideoCallContext] calls-v2 routerRtpCapabilities captured", { roomId });
          }
          joinedUnsub();
        });

        producerAddedUnsubRef.current?.();
        producerAddedUnsubRef.current = client.on("PRODUCER_ADDED", (frame) => {
          const payload = frame.payload as {
            roomId?: string;
            producerId?: string;
            peerDeviceId?: string;
            ownerUserId?: string;
            ownerDeviceId?: string;
            producer?: {
              producerId?: string;
              peerDeviceId?: string;
              ownerUserId?: string;
              ownerDeviceId?: string;
            };
          } | undefined;
          if (payload?.roomId !== roomId) return;

          const producerPayload = payload?.producer;
          const producerId = producerPayload?.producerId ?? payload?.producerId;
          if (!producerId) return;

          const peerDeviceIdRaw =
            producerPayload?.peerDeviceId ??
            producerPayload?.ownerDeviceId ??
            payload?.peerDeviceId ??
            payload?.ownerDeviceId;
          const peerDeviceId = typeof peerDeviceIdRaw === "string" ? peerDeviceIdRaw : "";
          const localDeviceId = getStableCallsDeviceId();
          if (peerDeviceId && peerDeviceId === localDeviceId) {
            logger.debug("[VideoCallContext] calls-v2 consume skipped for local producer", {
              roomId,
              producerId,
              peerDeviceId,
            });
            return;
          }

          const peerUserIdRaw =
            producerPayload?.ownerUserId ??
            payload?.ownerUserId ??
            (peerDeviceId ? peerUserIdByDeviceIdRef.current.get(peerDeviceId) : "");
          const peerUserId = typeof peerUserIdRaw === "string" ? peerUserIdRaw : "";
          if (peerUserId && peerDeviceId) {
            producerPeerKeyRef.current.set(producerId, `${peerUserId}:${peerDeviceId}`);
          } else if (peerUserId) {
            producerPeerKeyRef.current.set(producerId, peerUserId);
          }

           const rtpCapabilities =
             sfuManagerRef.current?.rtpCapabilities ??
             sfuRouterRtpCapabilitiesRef.current;
           if (!rtpCapabilities) {
             // Save to pending queue instead of skipping
             pendingProducersToConsumeRef.current.set(producerId, {
               roomId,
               peerDeviceId,
               peerUserId: peerDeviceId ? peerUserIdByDeviceIdRef.current.get(peerDeviceId) : undefined,
             });
             if (peerDeviceId && peerUserIdByDeviceIdRef.current.get(peerDeviceId)) {
               producerPeerKeyRef.current.set(producerId, `${peerUserIdByDeviceIdRef.current.get(peerDeviceId)}:${peerDeviceId}`);
             }
             return;
           }
          void client.consume({ roomId, producerId, rtpCapabilities }).catch((err) => {
            pendingProducersToConsumeRef.current.set(producerId, {
              roomId,
              peerDeviceId,
              peerUserId: peerDeviceId ? peerUserIdByDeviceIdRef.current.get(peerDeviceId) : undefined,
            });
            logger.warn("[VideoCallContext] calls-v2 consume failed; producer re-queued", {
              roomId,
              producerId,
              error: err instanceof Error ? err.message : String(err),
            });
            window.setTimeout(() => {
              consumePendingProducersRef.current?.();
            }, 250);
          });
        });

        callsWsCallIdRef.current = callId;
        lastSnapshotRoomVersionRef.current = -1;
        callsWsRoomRef.current = roomId;
        logger.info("[VideoCallContext] calls-v2 room-bootstrap:done", { callId, roomId });
        lastCallsBootstrapErrorRef.current = null;

        if (rekeyTimerRef.current) {
          window.clearInterval(rekeyTimerRef.current);
          rekeyTimerRef.current = null;
        }

        rekeyMachineRef.current?.onEvent((event) => {
          if (event.type !== 'REKEY_COMMITTED') return;

          const activeClient = callsWsRef.current;
          const activeRoomId = callsWsRoomRef.current;
          const machine = rekeyMachineRef.current;
          if (!activeClient || !activeRoomId || !machine) return;

          void (async () => {
            try {
              const readiness = canSendE2eeReady({
                epoch: event.epoch,
                mediaEncryption: callMediaEncryptionRef.current,
                rekeyMachine: machine,
                missingSenderKeys: missingSenderKeysRef?.current,
                inbound: getInboundE2eeReadiness?.() ?? (hasInboundE2eeReadiness ? { ready: hasInboundE2eeReadiness() } : null),
                requireQuorum: true,
              });
              if (!readiness.ready) {
                logger.warn("[VideoCallContext] calls-v2 rekey:commit blocked by E2EE_READY gate", readiness);
                machine.abortRekey("E2EE_READY gate not satisfied before local leader commit");
                epochGuardRef.current?.rollbackFailedEpoch(e2eeEpochRef.current);
                return;
              }

              await activeClient.rekeyCommit({ roomId: activeRoomId, epoch: event.epoch });
              machine.activateEpoch(event.epoch);
              e2eeEpochRef.current = event.epoch;
              epochGuardRef.current?.markE2eeReady(event.epoch);
              onE2eeActivated?.();
              await activeClient.e2eeReady({ roomId: activeRoomId, epoch: event.epoch });
              logger.info("[VideoCallContext] calls-v2 rekey:commit sent", { epoch: event.epoch, roomId: activeRoomId });
            } catch (err) {
              logger.error("[VideoCallContext] calls-v2 rekey:commit failed, aborting", err);
              machine.abortRekey(String(err));
              epochGuardRef.current?.rollbackFailedEpoch(e2eeEpochRef.current);
            }
          })();
        });

          const startRekey = (force: boolean, reason: string) => {
            // VCP-2 fix: Validate connection state before initiating rekey
            const activeClient = callsWsRef.current;
            if (!activeClient || activeClient.connectionState !== 'connected') {
              return;
            }
            const activeRoomId = callsWsRoomRef.current;
            const machine = rekeyMachineRef.current;
            const keyExchange = callKeyExchangeRef.current;
            if (!activeRoomId || !machine || !keyExchange) return;

            const newEpoch = machine.initiateRekey({ force });
            if (newEpoch === null) return;

            const mediaEncryption = callMediaEncryptionRef.current;
            epochGuardRef.current?.markEpochAdvanced(newEpoch);

            void (async () => {
              try {
                const epochKey = await keyExchange.createEpochKey(newEpoch);
                if (mediaEncryption) await mediaEncryption.setEncryptionKey(epochKey);

                await activeClient.rekeyBegin({ roomId: activeRoomId, epoch: newEpoch });
                machine.onRekeyBeginAcked(newEpoch);
                logger.info("[VideoCallContext] calls-v2 rekey:begin sent", { epoch: newEpoch, reason });
              } catch (err) {
                logger.error("[VideoCallContext] calls-v2 rekey:begin failed, aborting", err);
                machine.abortRekey(String(err));
                epochGuardRef.current?.rollbackFailedEpoch(e2eeEpochRef.current);
              }
            })();
          };

        rekeyTimerRef.current = window.setInterval(() => {
          startRekey(false, "periodic");
        }, REKEY_INTERVAL_MS);
        return true;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        logger.warn("[VideoCallContext] calls-v2 room bootstrap failed", {
          callId,
          role,
          error: errorMessage,
          wsState: callsWsRef.current?.connectionState ?? "none",
          hasRoomHint: !!hintedRoomId,
          hasJoinTokenHint: !!hintedJoinToken,
        });
        lastCallsBootstrapErrorRef.current = err instanceof Error ? err : new Error(String(err));
        return false;
      }
    },
    [
      callKeyExchangeRef,
      callMediaEncryptionRef,
      callsWsCallIdRef,
      callsWsRef,
      callsWsRoomRef,
      e2eeEpochRef,
      epochGuardRef,
      ensureCallsV2Connected,
      lastCallsBootstrapErrorRef,
      lastSnapshotRoomVersionRef,
      isCallStillActiveForBootstrap,
      getInboundE2eeReadiness,
      hasInboundE2eeReadiness,
      missingSenderKeysRef,
      onE2eeActivated,
      peerUserIdByDeviceIdRef,
      producerPeerKeyRef,
      rekeyMachineRef,
      rekeyTimerRef,
      sfuManagerRef,
      sfuRouterRtpCapabilitiesRef,
      turnIceServersRef,
      user,
    ]
  );

  return {
    ensureCallsV2Connected,
    bootstrapCallsV2Room,
  };
}
