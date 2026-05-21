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
  CALLS_V2_WS_URL,
  CALLS_V2_WS_URLS,
  REKEY_INTERVAL_MS,
  REQUIRE_SFRAME,
  expandWsEndpoints,
  isLocalEndpoint,
  hasInsertableStreamsSupport,
  extractRouterCapsFromJoinPayload,
} from "./videoCallProvider.helpers";
import { useCallsV2E2eeBootstrap } from "./useCallsV2E2eeBootstrap";

type UserLike = { id: string } | null;

interface UseCallsV2BootstrapParams {
  user: UserLike;
  fetchTurnIceServers: () => Promise<RTCIceServer[] | null>;
  setPendingIncomingCall: Dispatch<SetStateAction<VideoCall | null>>;
  callsWsRef: MutableRefObject<CallsWsClient | null>;
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
  callKeyExchangeRef: MutableRefObject<CallKeyExchange | null>;
  callMediaEncryptionRef: MutableRefObject<CallMediaEncryption | null>;
  rekeyMachineRef: MutableRefObject<RekeyStateMachine | null>;
  epochGuardRef: MutableRefObject<EpochGuard | null>;
  lastCallsBootstrapErrorRef: MutableRefObject<Error | null>;
  producerPeerKeyRef: MutableRefObject<Map<string, string>>;
  peerUserIdByDeviceIdRef: MutableRefObject<Map<string, string>>;
  handleE2eePipeBreakRef: MutableRefObject<((info: PipeBreakInfo) => void) | null>;
  consumeUnsubTimerRef: MutableRefObject<number | null>;
  isCallStillActiveForBootstrap: (callId: string) => boolean;
}

export function useCallsV2Bootstrap({
  user,
  fetchTurnIceServers,
  setPendingIncomingCall,
  callsWsRef,
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
  callKeyExchangeRef,
  callMediaEncryptionRef,
  rekeyMachineRef,
  epochGuardRef,
  lastCallsBootstrapErrorRef,
  producerPeerKeyRef,
  peerUserIdByDeviceIdRef,
  handleE2eePipeBreakRef,
  consumeUnsubTimerRef,
  isCallStillActiveForBootstrap,
}: UseCallsV2BootstrapParams) {
  const { initializeCallsV2E2ee } = useCallsV2E2eeBootstrap({
    user,
    callsWsRoomRef,
    lastSnapshotRoomVersionRef,
    e2eeEpochRef,
    e2eeLeaderDeviceRef,
    keyPackageNonceRef,
    callKeyExchangeRef,
    callMediaEncryptionRef,
    rekeyMachineRef,
    epochGuardRef,
    producerPeerKeyRef,
    peerUserIdByDeviceIdRef,
    handleE2eePipeBreakRef,
  });

  const ensureCallsV2Connected = useCallback(async (): Promise<CallsWsClient | null> => {
    if (!CALLS_V2_ENABLED || !user) return null;
    if (!CALLS_V2_WS_URL && CALLS_V2_WS_URLS.length === 0) {
      logger.warn("[VideoCallContext] calls-v2 disabled: no WS endpoint configured");
      return null;
    }
    // P2-8 fix: return existing client only if it's actually connected, not in a broken state
    if (callsWsRef.current) {
      const state = callsWsRef.current.connectionState;
      if (state === "connected" || state === "connecting" || state === "reconnecting") {
        return callsWsRef.current;
      }
      // Client is in failed/disconnected state — discard and create a new one
      callsWsRef.current.close();
      callsWsRef.current = null;
    }

    const rawEndpoints = CALLS_V2_WS_URLS.length > 0 ? CALLS_V2_WS_URLS : (CALLS_V2_WS_URL ? [CALLS_V2_WS_URL] : []);
    const endpoints = expandWsEndpoints(rawEndpoints);
    if (endpoints.length === 0) {
      logger.warn("[VideoCallContext] calls-v2 disabled: WS endpoints normalized to empty", { rawEndpoints });
      return null;
    }

    await fetchTurnIceServers();

    const requireWss = !import.meta.env.DEV && !endpoints.some(isLocalEndpoint);
    logger.info("[VideoCallContext] calls-v2 connect:start", {
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
        logger.info("[VideoCallContext] calls-v2 ws-state", { state });
      });
      await client.connect();
      offState(); // P1-5 fix: unsubscribe after connect — state changes are logged by wsClient internally
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
      const hasInsertableStreams = hasInsertableStreamsSupport();
      if (REQUIRE_SFRAME && !hasInsertableStreams) {
        throw new Error("calls_v2_e2ee_media_unsupported: Insertable Streams required for SFrame");
      }
      await client.e2eeCaps({
        insertableStreams: hasInsertableStreams,
        sframe: hasInsertableStreams,
        doubleRatchet: true,
        supportedCipherSuites: ["DOUBLE_RATCHET_P256_AES128GCM"],
      });
      logger.info("[VideoCallContext] calls-v2 e2ee_caps:ok");
      await initializeCallsV2E2ee(client);

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
        setPendingIncomingCall(syntheticCall);
      });

      callsWsRef.current = client;
      lastCallsBootstrapErrorRef.current = null;
      return client;
    } catch (err) {
      logger.error("[VideoCallContext] calls-v2 connect/bootstrap failed", err);
      lastCallsBootstrapErrorRef.current = err instanceof Error ? err : new Error(String(err));
      client.close();
      return null;
    }
  }, [
    callKeyExchangeRef,
    callMediaEncryptionRef,
    callsWsRef,
    callsWsRoomRef,
    fetchTurnIceServers,
    lastCallsBootstrapErrorRef,
    initializeCallsV2E2ee,
    setPendingIncomingCall,
    user,
  ]);

  const bootstrapCallsV2Room = useCallback(
    async (call: VideoCall, role: "caller" | "callee") => {
      if (!CALLS_V2_ENABLED || !user) return true;
      if (!CALLS_V2_WS_URL && CALLS_V2_WS_URLS.length === 0) return false;

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

      try {
        let roomId: string;
        let joinToken: string | undefined;

        if (role === "caller") {
          const allowedUserIds = [call.caller_id, call.callee_id].filter(
            (value, index, array): value is string => typeof value === "string" && value.length > 0 && array.indexOf(value) === index,
          );

          await client.roomCreate({
            callId,
            preferredRegion: "tr",
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
        } else {
          const hintedRoomId = (call as VideoCall & { room_id?: string; calls_v2_room_id?: string }).calls_v2_room_id
            ?? (call as VideoCall & { room_id?: string }).room_id;
          const hintedJoinToken = (call as VideoCall & { join_token?: string; calls_v2_join_token?: string }).calls_v2_join_token
            ?? (call as VideoCall & { join_token?: string }).join_token;

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

        await client.roomJoin({
          roomId,
          joinToken,
          deviceId: getStableCallsDeviceId(),
          preferredRegion: "tr",
        });
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
          logger.warn("[VideoCallContext] calls-v2 ROOM_JOIN_OK payload missing routerRtpCapabilities — will retry in media-bootstrap", {
            roomId,
            payloadKeys: joinedPayload ? Object.keys(joinedPayload) : [],
          });
        }
        const joinedTurn = (joinedPayload as Record<string, unknown> | undefined)?.turn as { iceServers?: RTCIceServer[] } | undefined;
        if (Array.isArray(joinedTurn?.iceServers) && joinedTurn.iceServers.length > 0 && !turnIceServersRef.current?.length) {
          turnIceServersRef.current = joinedTurn.iceServers;
          logger.info("[VideoCallContext] calls-v2 TURN iceServers seeded from ROOM_JOIN_OK", { count: joinedTurn.iceServers.length });
        }
        epochGuardRef.current?.markRoomJoined(e2eeEpochRef.current);
        await client.e2eeReady({ roomId, epoch: e2eeEpochRef.current });
        epochGuardRef.current?.markE2eeReady(e2eeEpochRef.current);
        logger.info("[VideoCallContext] calls-v2 e2ee-ready:ok", { roomId, epoch: e2eeEpochRef.current });

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

        const consumeUnsub = client.on("PRODUCER_ADDED", (frame) => {
          const payload = frame.payload as { roomId?: string; producerId?: string; peerDeviceId?: string } | undefined;
          if (payload?.roomId !== roomId) return;
          const producerId = payload?.producerId;
          if (!producerId) return;

          const peerDeviceId = typeof payload.peerDeviceId === "string" ? payload.peerDeviceId : "";
          const peerUserId = peerDeviceId ? peerUserIdByDeviceIdRef.current.get(peerDeviceId) : "";
          if (peerUserId && peerDeviceId) {
            producerPeerKeyRef.current.set(producerId, `${peerUserId}:${peerDeviceId}`);
          } else if (peerUserId) {
            producerPeerKeyRef.current.set(producerId, peerUserId);
          }

          const rtpCapabilities =
            sfuManagerRef.current?.rtpCapabilities ??
            sfuRouterRtpCapabilitiesRef.current;
          if (!rtpCapabilities) {
            logger.warn("[VideoCallContext] calls-v2 consume skipped: rtpCapabilities not ready", { roomId, producerId });
            return;
          }
          void client.consume({ roomId, producerId, rtpCapabilities }).catch((err) => {
            logger.warn("[VideoCallContext] calls-v2 consume failed", err);
          });
        });

        // P2-10 fix: store timer in ref so closeCallsV2 can cancel it
        if (consumeUnsubTimerRef.current !== null) {
          window.clearTimeout(consumeUnsubTimerRef.current);
        }
        consumeUnsubTimerRef.current = window.setTimeout(() => {
          consumeUnsubTimerRef.current = null;
          consumeUnsub();
        }, 10 * 60_000);

        callsWsCallIdRef.current = callId;
        lastSnapshotRoomVersionRef.current = -1;
        callsWsRoomRef.current = roomId;
        logger.info("[VideoCallContext] calls-v2 room-bootstrap:done", { callId, roomId });
        lastCallsBootstrapErrorRef.current = null;

        if (rekeyTimerRef.current) {
          window.clearInterval(rekeyTimerRef.current);
          rekeyTimerRef.current = null;
        }

        rekeyTimerRef.current = window.setInterval(() => {
          const activeClient = callsWsRef.current;
          const activeRoomId = callsWsRoomRef.current;
          const machine = rekeyMachineRef.current;
          const keyExchange = callKeyExchangeRef.current;
          if (!activeClient || !activeRoomId || !machine || !keyExchange) return;

          const newEpoch = machine.initiateRekey();
          if (newEpoch === null) return;

          const mediaEncryption = callMediaEncryptionRef.current;
          epochGuardRef.current?.markEpochAdvanced(newEpoch);

          void (async () => {
            try {
              const epochKey = await keyExchange.createEpochKey(newEpoch);
              if (mediaEncryption) await mediaEncryption.setEncryptionKey(epochKey);

              await activeClient.rekeyBegin({ roomId: activeRoomId, epoch: newEpoch });
              machine.onRekeyBeginAcked(newEpoch);
              logger.info("[VideoCallContext] calls-v2 rekey:begin sent", { epoch: newEpoch });
            } catch (err) {
              logger.error("[VideoCallContext] calls-v2 rekey:begin failed, aborting", err);
              machine.abortRekey(String(err));
              epochGuardRef.current?.rollbackFailedEpoch(e2eeEpochRef.current);
            }
          })();
        }, REKEY_INTERVAL_MS);
        return true;
      } catch (err) {
        logger.warn("[VideoCallContext] calls-v2 room bootstrap failed", err);
        return false;
      }
    },
    [
      callKeyExchangeRef,
      callMediaEncryptionRef,
      callsWsCallIdRef,
      callsWsMediaRoomRef,
      callsWsRecvTransportRef,
      callsWsRef,
      callsWsRoomRef,
      callsWsSendTransportRef,
      consumeUnsubTimerRef,
      e2eeEpochRef,
      epochGuardRef,
      ensureCallsV2Connected,
      lastCallsBootstrapErrorRef,
      lastSnapshotRoomVersionRef,
      isCallStillActiveForBootstrap,
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
