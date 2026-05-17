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
  CALLS_V2_WS_URL,
  CALLS_V2_WS_URLS,
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
  consumerAddedUnsubRef: MutableRefObject<(() => void) | null>;
  consumerCreateParamsRef: MutableRefObject<Map<string, import("@/calls-v2/types").ConsumedPayload>>;
  producerPeerKeyRef: MutableRefObject<Map<string, string>>;
  mediaBootstrapBlockedUntilRef: MutableRefObject<Map<string, number>>;
  mediaBootstrapErrorLogAtRef: MutableRefObject<Map<string, number>>;
  mediaBootstrapToastShownRef: MutableRefObject<Set<string>>;
  isScreenSharing: boolean;
  screenStream: MediaStream | null;
  setRemoteMediaStream: (stream: MediaStream | null) => void;
  setRemoteScreenStream: (stream: MediaStream | null) => void;
  callStateRef: MutableRefObject<CallState>;
  dispatchFsm: (event: CallEvent) => CallState;
  isCallConnecting: (state: CallState) => boolean;
  markMediaBootstrapProgress: (signal: "send_transport_created" | "recv_transport_created") => void;
  markMediaBootstrapFailed: (
    reason: string,
    details?: { roomId?: string; callId?: string; message?: string; stack?: string }
  ) => void;
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
  consumerAddedUnsubRef,
  consumerCreateParamsRef,
  producerPeerKeyRef,
  mediaBootstrapBlockedUntilRef,
  mediaBootstrapErrorLogAtRef,
  mediaBootstrapToastShownRef,
  isScreenSharing,
  screenStream,
  setRemoteMediaStream,
  setRemoteScreenStream,
  callStateRef,
  dispatchFsm,
  isCallConnecting,
  markMediaBootstrapProgress,
  markMediaBootstrapFailed,
}: UseCallsV2MediaBootstrapParams) {
  const rebuildRemoteStream = useCallback(() => {
    const manager = sfuManagerRef.current;
    if (!manager) {
      logger.debug("[VideoCallContext] rebuildRemoteStream: no sfuManager");
      setRemoteMediaStream(null);
      setRemoteScreenStream(null);
      return;
    }

    const allTracks = manager.getAllRemoteTracks();
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

    setRemoteMediaStream(primaryTracks.length > 0 ? new MediaStream(primaryTracks) : null);
    setRemoteScreenStream(screenVideoTrack ? new MediaStream([screenVideoTrack]) : null);

    const state = callStateRef.current;
    if (state === "media_ready") {
      dispatchFsm("REMOTE_MEDIA_READY");
      return;
    }
    if (isCallConnecting(state)) {
      dispatchFsm("PROMOTE_IN_CALL");
    }
  }, [callStateRef, dispatchFsm, isCallConnecting, setRemoteMediaStream, setRemoteScreenStream, sfuManagerRef]);

  const screenShareProducerIdsRef = useRef<string[]>([]);

  const syncScreenShareProducer = useCallback(async () => {
    const manager = sfuManagerRef.current;
    const roomId = callsWsMediaRoomRef.current;
    const stream = screenStream;

    if (!manager || !roomId) {
      return;
    }

    if (!isScreenSharing || !stream) {
      if (screenShareProducerIdsRef.current.length > 0) {
        for (const producerId of screenShareProducerIdsRef.current) {
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
          callMediaEncryptionRef.current?.setupSenderTransform(sender, producer.id);
        }
      }
      producerIds.push(producer.id);
    }
    screenShareProducerIdsRef.current = producerIds;
    logger.info("[VideoCallContext] calls-v2 screen-share producers ready", { roomId, count: producerIds.length });
  }, [callMediaEncryptionRef, callsWsMediaRoomRef, isScreenSharing, screenStream, sfuManagerRef]);

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
    if (!CALLS_V2_WS_URL && CALLS_V2_WS_URLS.length === 0) return;
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

      let routerRtpCapabilities = sfuRouterRtpCapabilitiesRef.current;
      if (!routerRtpCapabilities) {
        try {
          const joinOk = await client.waitFor(
            "ROOM_JOIN_OK",
            (frame) => {
              const payload = frame.payload as { roomId?: string } | undefined;
              return payload?.roomId === roomId;
            },
            { timeoutMs: 1200, acceptRecent: true }
          );
          const joinOkCaps = extractRouterCapsFromJoinPayload(joinOk.payload as Record<string, unknown> | undefined);
          if (joinOkCaps) {
            sfuRouterRtpCapabilitiesRef.current = joinOkCaps;
            routerRtpCapabilities = joinOkCaps;
          }
        } catch (error) {
          logger.debug("video_call_context.room_join_ok_caps_not_available_yet", {
            roomId,
            error,
          });
        }
      }

      if (!routerRtpCapabilities) {
        try {
          const joined = await client.waitFor(
            "ROOM_JOINED",
            (frame) => {
              const payload = frame.payload as { roomId?: string } | undefined;
              return payload?.roomId === roomId;
            },
            { timeoutMs: 1200, acceptRecent: true }
          );
          const joinedCaps = extractRouterCapsFromJoinPayload(joined.payload as Record<string, unknown> | undefined);
          if (joinedCaps) {
            sfuRouterRtpCapabilitiesRef.current = joinedCaps;
            routerRtpCapabilities = joinedCaps;
          }
        } catch (error) {
          logger.debug("video_call_context.room_joined_caps_not_available_yet", {
            roomId,
            error,
          });
        }
      }

      if (!routerRtpCapabilities) {
        try {
          await client.getRouterRtpCapabilities({ roomId });
          const rtpCapsFrame = await client.waitFor(
            "ROUTER_RTP_CAPABILITIES",
            (frame) => {
              const p = frame.payload as { roomId?: string } | undefined;
              return p?.roomId === roomId;
            },
            { timeoutMs: 3000, acceptRecent: false }
          );
          const rtpCaps = extractRouterCapsFromJoinPayload(rtpCapsFrame.payload as Record<string, unknown> | undefined);
          if (rtpCaps) {
            sfuRouterRtpCapabilitiesRef.current = rtpCaps;
            routerRtpCapabilities = rtpCaps;
            logger.info("[VideoCallContext] calls-v2 routerRtpCapabilities obtained via GET_ROUTER_RTP_CAPABILITIES fallback", { roomId });
          }
        } catch (error) {
          logger.debug("video_call_context.get_router_rtp_capabilities_not_supported", { roomId, error });
        }
      }

      if (!routerRtpCapabilities) {
        logger.warn("[VideoCallContext] calls-v2 media-bootstrap skipped: routerRtpCapabilities unresolved", { roomId });
        reportMediaBootstrapFailure(
          roomId,
          callId,
          new Error("routerRtpCapabilities missing in ROOM_JOIN_OK/ROOM_JOINED")
        );
        return;
      }

      if (!sfuManagerRef.current) {
        sfuManagerRef.current = new SfuMediaManager({
          requireSenderReceiverAccessForE2ee: CallMediaEncryption.isSupported(),
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

      await client.transportCreate({ roomId, direction: "send" });
      const sendCreated = await client.waitFor(
        "TRANSPORT_CREATED",
        (frame) => {
          const p = frame.payload as { roomId?: string; direction?: string } | undefined;
          return p?.roomId === roomId && p?.direction === "send";
        },
        { timeoutMs: 5000, acceptRecent: true }
      );
      const sendParams = sendCreated.payload as import("@/calls-v2/types").TransportCreatedPayload | undefined;
      if (!isValidTransportCreatedPayload(sendParams)) {
        reportMediaBootstrapFailure(
          roomId,
          callId,
          new Error("invalid send transport payload from SFU")
        );
        return;
      }
      logger.info("[VideoCallContext] calls-v2 transport-created:send", { roomId, transportId: sendParams.transportId });
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
          await client.produce({
            roomId,
            transportId: sendParams.transportId,
            kind,
            rtpParameters: rtpParameters as import("@/calls-v2/types").RtpParameters,
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
          logger.info("[VideoCallContext] calls-v2 produce:ok", { roomId, kind, producerId });
          return producerId;
        }
      );
      callsWsSendTransportRef.current = sendParams.transportId;

      await client.transportCreate({ roomId, direction: "recv" });
      const recvCreated = await client.waitFor(
        "TRANSPORT_CREATED",
        (frame) => {
          const p = frame.payload as { roomId?: string; direction?: string } | undefined;
          return p?.roomId === roomId && p?.direction === "recv";
        },
        { timeoutMs: 5000, acceptRecent: true }
      );
      const recvParams = recvCreated.payload as import("@/calls-v2/types").TransportCreatedPayload | undefined;
      if (!isValidTransportCreatedPayload(recvParams)) {
        reportMediaBootstrapFailure(
          roomId,
          callId,
          new Error("invalid recv transport payload from SFU")
        );
        return;
      }
      logger.info("[VideoCallContext] calls-v2 transport-created:recv", { roomId, transportId: recvParams.transportId });
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

      if (consumerAddedUnsubRef.current) {
        consumerAddedUnsubRef.current();
        consumerAddedUnsubRef.current = null;
      }

      consumerAddedUnsubRef.current = client.on("CONSUMER_ADDED", (frame) => {
        const p = frame.payload as import("@/calls-v2/types").ConsumedPayload | undefined;
        if (!p || p.roomId !== roomId) return;

        logger.debug("[VideoCallContext] CONSUMER_ADDED received", {
          consumerId: p.consumerId,
          producerId: p.producerId,
          kind: p.kind,
          peerId: p.peerId,
          roomId: roomId.slice(0, 8),
        });

        void sfuManager.consume({
          id: p.consumerId,
          producerId: p.producerId,
          kind: p.kind as import("mediasoup-client").types.MediaKind,
          rtpParameters: p.rtpParameters as import("mediasoup-client").types.RtpParameters,
          source: p.source,
        }).then((consumer) => {
          logger.info("[VideoCallContext] calls-v2 consumer:created", {
            roomId,
            consumerId: consumer.id,
            kind: consumer.kind,
            trackId: consumer.track?.id,
            trackKind: consumer.track?.kind,
            trackState: consumer.track?.readyState,
          });

          consumerCreateParamsRef.current.set(consumer.id, p);
           if (REQUIRE_SFRAME && CallMediaEncryption.isSupported()) {
             const enc = callMediaEncryptionRef.current;
             const receiver = sfuManagerRef.current?.getConsumerReceiver(consumer.id);
             const peerKey = p.peerId
               || producerPeerKeyRef.current.get(p.producerId)
               || p.producerId;
             logger.debug("[VideoCallContext] E2EE setupReceiverTransform", {
               consumerId: consumer.id,
               peerKey,
               peerIdField: p.peerId,
               fromProducerRef: producerPeerKeyRef.current.get(p.producerId),
               producerId: p.producerId,
               hasEncryption: enc?.hasEncryptionKey,
               decryptionKeysCount: enc ? enc.peerDecryptionEpochs.size : -1,
               allDecryptionKeys: enc ? Array.from(enc.peerDecryptionEpochs.keys()) : [],
             });
             if (receiver && enc) {
               enc.setupReceiverTransform(receiver, peerKey, consumer.id);
               logger.info("[VideoCallContext] E2EE setupReceiverTransform:ok", {
                 peerKey,
                 consumerId: consumer.id,
                 decryptionKeysNow: Array.from(enc.peerDecryptionEpochs.keys()),
               });
             }
           }
          return client.consumerResume({ roomId, consumerId: consumer.id }).then(() => {
            logger.debug("[VideoCallContext] consumerResume done, calling rebuildRemoteStream");
            rebuildRemoteStream();
          });
        }).catch((err) => {
          logger.error("[VideoCallContext] calls-v2 consume/resume failed", err);
        });
      });

      // Create E2EE key BEFORE producing tracks (H-6 fix: must be set BEFORE setupSenderTransform)
      if (REQUIRE_SFRAME && CallMediaEncryption.isSupported()) {
        const kx = callKeyExchangeRef.current;
        const enc = callMediaEncryptionRef.current;
        if (kx && enc) {
          const epoch = e2eeEpochRef.current ?? 0;
          const epochKey = await kx.createEpochKey(epoch);
          await enc.setEncryptionKey(epochKey);
          logger.info("[VideoCallContext] calls-v2 initial E2EE key set", { roomId, epoch });
        }
      }

      const tracks = stream.getTracks().filter((track) => track.readyState === "live");
      for (const track of tracks) {
        const source = track.kind === "audio" ? "microphone" : "camera";
        const producer = await sfuManager.produce(track, { trackId: track.id, source });
        if (track.kind === "audio" || track.kind === "video") {
          localProducerIdsRef.current[track.kind] = producer.id;
        }
        if (REQUIRE_SFRAME && CallMediaEncryption.isSupported()) {
          const sender = sfuManagerRef.current?.getProducerSender(producer.id);
          if (sender) {
            callMediaEncryptionRef.current?.setupSenderTransform(sender, producer.id);
          }
        }
      }

      rebuildRemoteStream();

      callsWsMediaRoomRef.current = roomId;
      mediaBootstrapBlockedUntilRef.current.delete(roomId);
      mediaBootstrapErrorLogAtRef.current.delete(roomId);
      mediaBootstrapToastShownRef.current.delete(roomId);
      logger.info("[VideoCallContext] calls-v2 media-bootstrap:done", { roomId, trackCount: tracks.length });
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
    consumerAddedUnsubRef,
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
    producerPeerKeyRef,
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
