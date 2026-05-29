import { useCallback, useEffect, useRef, type MutableRefObject } from "react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { SfuMediaManager } from "@/calls-v2/sfuMediaManager";
import { CallMediaEncryption } from "@/calls-v2/callMediaEncryption";
import type { CallsWsClient } from "@/calls-v2/wsClient";
import type { VideoCall } from "@/hooks/useVideoCallSfu";
import type { CallEvent, CallState } from "@/calls-v2/callStateMachine";
import type { EpochGuard } from "@/calls-v2/epochGuard";
import type { CallKeyExchange } from "@/calls-v2/callKeyExchange";
import type { RtpCapabilities } from "@/calls-v2/types";
import {
  CALLS_V2_ENABLED,
  CALLS_V2_ENDPOINTS,
  MEDIA_BOOTSTRAP_RETRY_BACKOFF_MS,
  REQUIRE_SFRAME,
  extractRouterCapsFromJoinPayload,
  isValidTransportCreatedPayload,
} from "./videoCallProvider.helpers";

interface UseCallsV2MediaBootstrapParams {
  user: { id: string } | null;
  ensureCallsV2Connected: () => Promise<CallsWsClient | null>;
  callsWsRef: MutableRefObject<CallsWsClient | null>;
  sfuManagerRef: MutableRefObject<SfuMediaManager | null>;
  sfuRouterRtpCapabilitiesRef: MutableRefObject<RtpCapabilities | null>;
  callsWsCallIdRef: MutableRefObject<string | null>;
  callsWsRoomRef: MutableRefObject<string | null>;
  callsWsMediaRoomRef: MutableRefObject<string | null>;
  callsWsMediaBootstrapInFlightRoomRef: MutableRefObject<string | null>;
  callsWsSendTransportRef: MutableRefObject<string | null>;
  callsWsRecvTransportRef: MutableRefObject<string | null>;
  turnIceServersRef: MutableRefObject<RTCIceServer[] | null>;
  epochGuardRef: MutableRefObject<EpochGuard | null>;
  e2eeEpochRef: MutableRefObject<number>;
  callKeyExchangeRef: MutableRefObject<CallKeyExchange | null>;
  callMediaEncryptionRef: MutableRefObject<CallMediaEncryption | null>;
  localProducerIdsRef: MutableRefObject<{ audio: string | null; video: string | null }>;
  consumerCreateParamsRef: MutableRefObject<Map<string, import("@/calls-v2/types").ConsumerReplayDescriptor>>;
  producerPeerKeyRef: MutableRefObject<Map<string, string>>;
  pendingReceiverTransformsRef: MutableRefObject<Map<string, {
    receiver: RTCRtpReceiver;
    peerKey: string;
    deferredAt: number;
    recoveryRequested: boolean;
  }>>;
  mediaBootstrapBlockedUntilRef: MutableRefObject<Map<string, number>>;
  mediaBootstrapErrorLogAtRef: MutableRefObject<Map<string, number>>;
  mediaBootstrapToastShownRef: MutableRefObject<Set<string>>;
  mediaBootstrapCompletedRef: MutableRefObject<Map<string, boolean>>;
  isScreenSharing: boolean;
  screenStream: MediaStream | null;
  setRemoteMediaStream: (stream: MediaStream | null) => void;
  setRemoteScreenStream: (stream: MediaStream | null) => void;
  callStateRef: MutableRefObject<CallState>;
dispatchFsm: (event: CallEvent) => CallState;
  isCallConnecting: (state: CallState) => boolean;
  canPromoteInCall: () => boolean;
  markMediaBootstrapProgress: (signal: "send_transport_created" | "recv_transport_created") => void;
  markMediaBootstrapFailed: (
    reason: string,
    details?: { roomId?: string; callId?: string; message?: string; stack?: string }
  ) => void;
  pendingProducersToConsumeRef: MutableRefObject<Map<string, { roomId: string; peerDeviceId?: string; peerUserId?: string }>>;
  consumePendingProducersRef: MutableRefObject<(() => void) | null>;
}

export function useCallsV2MediaBootstrap({
  user,
  ensureCallsV2Connected,
  callsWsRef,
  sfuManagerRef,
  sfuRouterRtpCapabilitiesRef,
  callsWsCallIdRef,
  callsWsRoomRef,
  callsWsMediaRoomRef,
  callsWsMediaBootstrapInFlightRoomRef,
  callsWsSendTransportRef,
  callsWsRecvTransportRef,
  turnIceServersRef,
  epochGuardRef,
  e2eeEpochRef,
  callKeyExchangeRef,
  callMediaEncryptionRef,
  localProducerIdsRef,
  consumerCreateParamsRef,
  producerPeerKeyRef,
  pendingReceiverTransformsRef,
  mediaBootstrapBlockedUntilRef,
  mediaBootstrapErrorLogAtRef,
  mediaBootstrapToastShownRef,
  mediaBootstrapCompletedRef,
  isScreenSharing,
screenStream,
  setRemoteMediaStream,
  setRemoteScreenStream,
  callStateRef,
  dispatchFsm,
  isCallConnecting,
  canPromoteInCall,
  markMediaBootstrapProgress,
  markMediaBootstrapFailed,
  pendingProducersToConsumeRef,
  consumePendingProducersRef,
}: UseCallsV2MediaBootstrapParams) {
  const rebuildRemoteStream = useCallback(() => {
    const manager = sfuManagerRef.current;
    if (!manager) {
      logger.debug("[VideoCallContext] rebuildRemoteStream: no sfuManager");
      setRemoteMediaStream(null);
      setRemoteScreenStream(null);
      return;
    }

    const allTracks = manager.getAllRemoteTracks().filter((track) => track.readyState === "live");
    const audioTracks = allTracks.filter((track) => track.kind === "audio");
    const videoTracks = allTracks.filter((track) => track.kind === "video");
    logger.debug("[VideoCallContext] rebuildRemoteStream", {
      totalTracks: allTracks.length,
      audioTracks: audioTracks.length,
      videoTracks: videoTracks.length,
      trackDetails: allTracks.map((t) => `${t.kind}:${t.readyState}`).join(", "),
    });

    if (allTracks.length === 0) {
      setRemoteMediaStream(null);
      setRemoteScreenStream(null);
      return;
    }

    const screenVideoTrack = videoTracks.find((track) => manager.getRemoteTrackSource(track) === "screen") ?? null;
    const primaryVideoTrack = videoTracks.find((track) => track !== screenVideoTrack) ?? null;
    const primaryTracks = primaryVideoTrack ? [...audioTracks, primaryVideoTrack] : [...audioTracks];
    const state = callStateRef.current;

    setRemoteMediaStream(primaryTracks.length > 0 ? new MediaStream(primaryTracks) : null);
    setRemoteScreenStream(screenVideoTrack ? new MediaStream([screenVideoTrack]) : null);

    if (!canPromoteInCall()) {
      logger.debug("[VideoCallContext] rebuildRemoteStream: promotion deferred until call status is connected", {
        state,
      });
      return;
    }

    if (state === "media_ready") {
      dispatchFsm("REMOTE_MEDIA_READY");
      return;
    }
    if (isCallConnecting(state)) {
      dispatchFsm("PROMOTE_IN_CALL");
    }
  }, [callStateRef, canPromoteInCall, dispatchFsm, isCallConnecting, setRemoteMediaStream, setRemoteScreenStream, sfuManagerRef]);

  const screenShareProducerIdsRef = useRef<string[]>([]);

  const syncScreenShareProducer = useCallback(async () => {
    const manager = sfuManagerRef.current;
    const client = callsWsRef.current;
    const roomId = callsWsMediaRoomRef.current;
    const stream = screenStream;

    if (!manager || !roomId) {
      if (screenShareProducerIdsRef.current.length > 0) {
        if (manager) {
          for (const producerId of screenShareProducerIdsRef.current) {
            manager.closeProducer(producerId);
          }
        }
        logger.warn("[VideoCallContext] screen-share producer ids reset without active media room", {
          hadManager: !!manager,
          hadRoomId: !!roomId,
          leakedCount: screenShareProducerIdsRef.current.length,
        });
        screenShareProducerIdsRef.current = [];
      }
      return;
    }

    if (!isScreenSharing || !stream) {
      if (screenShareProducerIdsRef.current.length > 0) {
        for (const producerId of screenShareProducerIdsRef.current) {
          if (client && roomId) {
            await client.producerClose({ roomId, producerId }).catch((error) => {
              logger.warn("[VideoCallContext] screen-share producerClose failed", { roomId, producerId, error });
            });
          }
          manager.closeProducer(producerId);
        }
        screenShareProducerIdsRef.current = [];
      }
      return;
    }

    if (screenShareProducerIdsRef.current.length > 0) {
      return;
    }

    const tracks = stream.getVideoTracks().filter((track) => track.readyState === "live");
    if (tracks.length === 0) {
      return;
    }

    const producerIds: string[] = [];
    for (const track of tracks) {
      const producer = await manager.produce(track, { trackId: track.id, source: "screen" });
      if (REQUIRE_SFRAME && CallMediaEncryption.isSupported()) {
        const sender = manager.getProducerSender(producer.id);
        if (sender) {
          try {
            callMediaEncryptionRef.current?.setupSenderTransform(sender, producer.id);
          } catch (e) {
            logger.error("[VideoCallContext] E2EE setupSenderTransform failed for screen-share producer", {
              producerId: producer.id,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }
      }
      producerIds.push(producer.id);
    }
    screenShareProducerIdsRef.current = producerIds;
    logger.info("[VideoCallContext] calls-v2 screen-share producers ready", { roomId, count: producerIds.length });
  }, [callMediaEncryptionRef, callsWsMediaRoomRef, callsWsRef, isScreenSharing, screenStream, sfuManagerRef]);

  useEffect(() => {
    void syncScreenShareProducer();
  }, [syncScreenShareProducer]);

  const reportMediaBootstrapFailure = useCallback((roomId: string, callId: string, error: unknown) => {
    const now = Date.now();
    const lastLogAt = mediaBootstrapErrorLogAtRef.current.get(roomId) ?? 0;
    const shouldLog = now - lastLogAt >= MEDIA_BOOTSTRAP_RETRY_BACKOFF_MS;

    mediaBootstrapBlockedUntilRef.current.set(roomId, now + MEDIA_BOOTSTRAP_RETRY_BACKOFF_MS);
    mediaBootstrapErrorLogAtRef.current.set(roomId, now);

    markMediaBootstrapFailed(`calls_v2_media_bootstrap_failed: ${error instanceof Error ? error.message : String(error)}`, {
      roomId,
      callId,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    if (shouldLog) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const hasSfu = !!sfuManagerRef.current;
      const hasWs = !!callsWsRef.current;
      const hasIce = !!(turnIceServersRef.current && turnIceServersRef.current.length > 0);
      logger.error(
        `[VideoCallContext] media-bootstrap FAILED: ${errMsg} | sfu=${hasSfu} ws=${hasWs} ice=${hasIce} room=${roomId.slice(0, 8)}`
      );
    }

    if (!mediaBootstrapToastShownRef.current.has(roomId)) {
      mediaBootstrapToastShownRef.current.add(roomId);
      toast.error("Ошибка подключения медиа", {
        description: "SFU не завершил создание медиа-транспортов. Повторите звонок или смените сеть.",
        duration: 5000,
      });
    }

    dispatchFsm("ERROR");
  }, [
    callsWsRef,
    dispatchFsm,
    markMediaBootstrapFailed,
    mediaBootstrapBlockedUntilRef,
    mediaBootstrapErrorLogAtRef,
    mediaBootstrapToastShownRef,
    sfuManagerRef,
    turnIceServersRef,
  ]);

  const bootstrapCallsV2Media = useCallback(async (call: VideoCall, stream: MediaStream | null) => {
    if (!CALLS_V2_ENABLED || !user || !stream) return;
    if (CALLS_V2_ENDPOINTS.length === 0) return;
    const callId = call.id;
    const hintedRoomId = (call as VideoCall & { room_id?: string; calls_v2_room_id?: string }).calls_v2_room_id
      ?? (call as VideoCall & { room_id?: string }).room_id;
    const roomId = callsWsCallIdRef.current === callId
      ? callsWsRoomRef.current
      : (hintedRoomId ?? null);

    if (!roomId) {
      logger.warn("[VideoCallContext] calls-v2 media-bootstrap skipped: room unresolved", {
        callId,
        mappedCallId: callsWsCallIdRef.current,
        mappedRoomId: callsWsRoomRef.current,
        hintedRoomId,
      });
      return;
    }

    if (callsWsRoomRef.current !== roomId) return;
    if (callsWsMediaRoomRef.current === roomId) return;
    if (callsWsMediaBootstrapInFlightRoomRef.current === roomId) return;

    const blockedUntil = mediaBootstrapBlockedUntilRef.current.get(roomId) ?? 0;
    if (Date.now() < blockedUntil) return;

    const client = callsWsRef.current ?? (await ensureCallsV2Connected());
    if (!client) return;

    callsWsMediaBootstrapInFlightRoomRef.current = roomId;

    try {
      logger.info("[VideoCallContext] calls-v2 media-bootstrap:start", { callId, roomId });

      const epochGuard = epochGuardRef.current;
      if (epochGuard && !epochGuard.isMediaAllowed()) {
        logger.info("[VideoCallContext] calls-v2 media-bootstrap deferred by epoch guard", {
          callId,
          roomId,
          reason: epochGuard.getMediaBlockReason(),
          epoch: epochGuard.getEpoch(),
        });
        return;
      }

      const routerRtpCapabilities = sfuRouterRtpCapabilitiesRef.current;

      if (!routerRtpCapabilities) {
        logger.error("[VideoCallContext] calls-v2 media-bootstrap aborted: missing routerRtpCapabilities from ROOM_JOIN_OK", { roomId });
        reportMediaBootstrapFailure(
          roomId,
          callId,
          new Error("FATAL protocol violation: routerRtpCapabilities missing in ROOM_JOIN_OK")
        );
        return;
      }

      if (!sfuManagerRef.current) {
        sfuManagerRef.current = new SfuMediaManager({
          requireSenderReceiverAccessForE2ee: REQUIRE_SFRAME && CallMediaEncryption.isSupported(),
          onTransportClosed: (transportId, direction) => {
            logger.error("[VideoCallContext] ICE restart exhausted — transport permanently closed", { transportId, direction });
            dispatchFsm("ERROR");
          },
        });
      }
      const sfuManager = sfuManagerRef.current;

      const iceServersSnapshot = turnIceServersRef.current ?? undefined;
      if (iceServersSnapshot && iceServersSnapshot.length > 0) {
        logger.info("[VideoCallContext] TURN iceServers ready for SFU transports", { count: iceServersSnapshot.length });
      } else {
        logger.warn("[VideoCallContext] No TURN ice servers available — SFU will use STUN only (may fail behind strict NAT)");
      }

      await sfuManager.loadDevice(routerRtpCapabilities as import("mediasoup-client").types.RtpCapabilities);

      // P0-1 fix: subscribe BEFORE sending transportCreate so we never miss the server event.
      // acceptRecent:false prevents matching a stale cached event from a previous bootstrap.
      // Параллелим оба transportCreate (send + recv) — независимые request/response к SFU,
      // экономит ~1 RTT на старте звонка.
      const sendCreatedPromise = client.waitFor(
        "TRANSPORT_CREATED",
        (frame) => {
          const p = frame.payload as { roomId?: string; direction?: string } | undefined;
          return p?.roomId === roomId && p?.direction === "send";
        },
        { timeoutMs: 5000 }
      );
      const recvCreatedPromise = client.waitFor(
        "TRANSPORT_CREATED",
        (frame) => {
          const p = frame.payload as { roomId?: string; direction?: string } | undefined;
          return p?.roomId === roomId && p?.direction === "recv";
        },
        { timeoutMs: 5000 }
      );
      await Promise.all([
        client.transportCreate({ roomId, direction: "send" }),
        client.transportCreate({ roomId, direction: "recv" }),
      ]);
      const [sendCreated, recvCreated] = await Promise.all([sendCreatedPromise, recvCreatedPromise]);
      const sendParams = sendCreated.payload as import("@/calls-v2/types").TransportCreatedPayload | undefined;
      const recvParams = recvCreated.payload as import("@/calls-v2/types").TransportCreatedPayload | undefined;
      if (!isValidTransportCreatedPayload(sendParams)) {
        reportMediaBootstrapFailure(
          roomId,
          callId,
          new Error("invalid send transport payload from SFU")
        );
        return;
      }
      if (!isValidTransportCreatedPayload(recvParams)) {
        reportMediaBootstrapFailure(
          roomId,
          callId,
          new Error("invalid recv transport payload from SFU")
        );
        return;
      }
      logger.info("[VideoCallContext] calls-v2 transport-created:send", { roomId, transportId: sendParams.transportId });
      logger.info("[VideoCallContext] calls-v2 transport-created:recv", { roomId, transportId: recvParams.transportId });
      if (callStateRef.current === "bootstrapping") {
        dispatchFsm("BOOTSTRAP_OK");
      }
      markMediaBootstrapProgress("send_transport_created");
      dispatchFsm("MEDIA_ACQUIRED");

      sfuManager.createSendTransport(
        {
          id: sendParams.transportId,
          iceParameters: sendParams.iceParameters as import("mediasoup-client").types.IceParameters,
          iceCandidates: sendParams.iceCandidates as import("mediasoup-client").types.IceCandidate[],
          dtlsParameters: sendParams.dtlsParameters as import("mediasoup-client").types.DtlsParameters,
          iceServers: iceServersSnapshot,
        },
        async (dtlsParameters) => {
          await client.transportConnect({
            roomId,
            transportId: sendParams.transportId,
            dtlsParameters: dtlsParameters as import("@/calls-v2/types").DtlsParameters,
          });
          logger.info("[VideoCallContext] calls-v2 transport-connect:send:ok", { roomId });
        },
        async ({ kind, rtpParameters, appData }) => {
          const expectedSource = typeof appData?.source === "string" ? appData.source : undefined;
          const producedPromise = client.waitFor(
            "PRODUCED",
            (frame) => {
              const p = frame.payload as { roomId?: string; producerId?: string; source?: string } | undefined;
              if (p?.roomId !== roomId || typeof p?.producerId !== "string") return false;
              // If server reports source, bind ACK to the specific produce request.
              if (expectedSource && typeof p.source === "string") return p.source === expectedSource;
              return true;
            },
            { timeoutMs: 5000, acceptRecent: false }
          );

          await client.produce({
            roomId,
            transportId: sendParams.transportId,
            kind,
            rtpParameters: rtpParameters as import("@/calls-v2/types").RtpParameters,
            appData: appData as Record<string, unknown>,
          });
          const producedFrame = await producedPromise;
          const producerId = (producedFrame.payload as { producerId?: string })?.producerId;
          if (!producerId) throw new Error("PRODUCED event missing producerId");
          logger.info("[VideoCallContext] calls-v2 produce:ok", { roomId, kind, producerId });
          return producerId;
        }
      );
      callsWsSendTransportRef.current = sendParams.transportId;

      markMediaBootstrapProgress("recv_transport_created");
      dispatchFsm("TRANSPORT_CONNECTED");

      sfuManager.createRecvTransport(
        {
          id: recvParams.transportId,
          iceParameters: recvParams.iceParameters as import("mediasoup-client").types.IceParameters,
          iceCandidates: recvParams.iceCandidates as import("mediasoup-client").types.IceCandidate[],
          dtlsParameters: recvParams.dtlsParameters as import("mediasoup-client").types.DtlsParameters,
          iceServers: iceServersSnapshot,
        },
        async (dtlsParameters) => {
await client.transportConnect({
            roomId,
            transportId: recvParams.transportId,
            dtlsParameters: dtlsParameters as import("@/calls-v2/types").DtlsParameters,
          });
          logger.info("[VideoCallContext] calls-v2 transport-connect:recv:ok", { roomId });
        }
      );
      callsWsRecvTransportRef.current = recvParams.transportId;

      // Process pending producers now that recv transport is ready
      consumePendingProducersRef.current?.();

      // Create E2EE key BEFORE producing tracks (H-6 fix: must be set BEFORE setupSenderTransform).
      // FIX: reuse the epoch key already created during room bootstrap to avoid generating
      // a second key for the same epoch.  regenerate = epoch key reset in the encryptor and
      // media sent as plaintext until the new key propagates via REKEY_BEGIN/KEY_PACKAGE cycle.
      if (REQUIRE_SFRAME && CallMediaEncryption.isSupported()) {
        const kx = callKeyExchangeRef.current;
        const enc = callMediaEncryptionRef.current;
        if (kx && enc) {
          const epoch = e2eeEpochRef.current ?? 0;
          let epochKey = kx.getCurrentEpochKey();
          if (!epochKey || epochKey.epoch !== epoch) {
            epochKey = await kx.createEpochKey(epoch);
          }
          await enc.setEncryptionKey(epochKey);
          const decryptionKeysBefore = enc.getDecryptionPeerIds().length;
          logger.info("[VideoCallContext] calls-v2 initial E2EE key set", { roomId, epoch, decryptionKeysBefore });
        }
      }

      const tracks = stream.getTracks().filter((track) => track.readyState === "live");
      // Параллельный produce audio+video — экономит RTT на старте звонка.
      // Внутри SfuMediaManager.produce каждый produce() — независимый round-trip к SFU,
      // но они не зависят друг от друга и могут идти одновременно.
      await Promise.all(tracks.map(async (track) => {
        const source = track.kind === "audio" ? "microphone" : "camera";
        const producer = await sfuManager.produce(track, { trackId: track.id, source });
        if (track.kind === "audio" || track.kind === "video") {
          localProducerIdsRef.current[track.kind] = producer.id;
        }
        if (REQUIRE_SFRAME && CallMediaEncryption.isSupported()) {
          const sender = sfuManagerRef.current?.getProducerSender(producer.id);
          if (sender) {
            try {
              callMediaEncryptionRef.current?.setupSenderTransform(sender, producer.id);
            } catch (e) {
              logger.error("[VideoCallContext] E2EE setupSenderTransform failed for producer", {
                producerId: producer.id,
                trackId: track.id,
                error: e instanceof Error ? e.message : String(e),
              });
            }
          }
        }
      }));

      rebuildRemoteStream();

      callsWsMediaRoomRef.current = roomId;
      mediaBootstrapBlockedUntilRef.current.delete(roomId);
      mediaBootstrapErrorLogAtRef.current.delete(roomId);
      mediaBootstrapToastShownRef.current.delete(roomId);
       logger.info("[VideoCallContext] calls-v2 media-bootstrap:done", { roomId, trackCount: tracks.length });
       // Mark media bootstrap as completed for this call
       if (user) {
         mediaBootstrapCompletedRef.current.set(call.id, true);
       }
     } catch (err) {
       logger.error("[VideoCallContext] calls-v2 media bootstrap failed", err);
       reportMediaBootstrapFailure(roomId, callId, err);
     } finally {
       if (callsWsMediaBootstrapInFlightRoomRef.current === roomId) {
         callsWsMediaBootstrapInFlightRoomRef.current = null;
       }
     }
  }, [
    callKeyExchangeRef,
    callMediaEncryptionRef,
    callStateRef,
    callsWsCallIdRef,
    callsWsMediaBootstrapInFlightRoomRef,
    callsWsMediaRoomRef,
    callsWsRecvTransportRef,
    callsWsRef,
    callsWsRoomRef,
    callsWsSendTransportRef,
    consumerCreateParamsRef,
dispatchFsm,
    e2eeEpochRef,
    ensureCallsV2Connected,
    epochGuardRef,
    localProducerIdsRef,
    markMediaBootstrapProgress,
    mediaBootstrapBlockedUntilRef,
    mediaBootstrapErrorLogAtRef,
    mediaBootstrapToastShownRef,
    pendingReceiverTransformsRef,
    pendingProducersToConsumeRef,
    producerPeerKeyRef,
    consumePendingProducersRef,
    rebuildRemoteStream,
    reportMediaBootstrapFailure,
    sfuManagerRef,
    sfuRouterRtpCapabilitiesRef,
    turnIceServersRef,
    user,
  ]);

  return {
    rebuildRemoteStream,
    syncScreenShareProducer,
    bootstrapCallsV2Media,
  };
}
