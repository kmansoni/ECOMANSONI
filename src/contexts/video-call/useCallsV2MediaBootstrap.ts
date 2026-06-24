import { useCallback, useEffect, useRef, type MutableRefObject } from "react";
import { logger } from "@/lib/logger";
import { callNotifications } from "./notificationService";
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
  TURN_REQUIRED_MISSING_ERROR,
  canSendE2eeReady,
  extractRouterCapsFromJoinPayload,
  hasE2eeSupport,
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
  rekeyMachineRef: MutableRefObject<import("@/calls-v2/rekeyStateMachine").RekeyStateMachine | null>;
  missingSenderKeysRef?: MutableRefObject<Set<string>>;
  localProducerIdsRef: MutableRefObject<{ audio: string | null; video: string | null }>;
  onE2eeReady?: () => void;
  getInboundE2eeReadiness?: () => { ready: boolean; missingDecryptionPeers: string[]; pendingConsumers: string[] };
  consumerCreateParamsRef: MutableRefObject<Map<string, import("@/calls-v2/types").ConsumerReplayDescriptor>>;
  producerPeerKeyRef: MutableRefObject<Map<string, string>>;
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
  rekeyMachineRef,
  missingSenderKeysRef,
  localProducerIdsRef,
  onE2eeReady,
  getInboundE2eeReadiness,
  consumerCreateParamsRef,
  producerPeerKeyRef,
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
      const producer = await manager.produce(
        track,
        { trackId: track.id, source: "screen" },
        REQUIRE_SFRAME && hasE2eeSupport()
          ? (sender, producerId) => callMediaEncryptionRef.current?.setupSenderTransform(sender, producerId)
          : undefined
      );
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
      callNotifications.error({
        title: "Ошибка подключения медиа",
        description: "SFU не завершил создание медиа-транспортов. Повторите звонок или смените сеть.",
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

    // completed: true → media already bootstrapped for this call, skip
    if (mediaBootstrapCompletedRef.current.get(call.id)) return;

    const blockedUntil = mediaBootstrapBlockedUntilRef.current.get(roomId) ?? 0;
    if (Date.now() < blockedUntil) return;

    const client = callsWsRef.current ?? (await ensureCallsV2Connected());
    if (!client) return;

    callsWsMediaBootstrapInFlightRoomRef.current = roomId;

    try {
      logger.info("[VideoCallContext] calls-v2 media-bootstrap:start", { callId, roomId });

      const epochGuard = epochGuardRef.current;
      if (epochGuard && !epochGuard.isMediaAllowed()) {
        const blockReason = epochGuard.getMediaBlockReason();
        if (blockReason !== "E2EE not ready — no valid epoch key") {
          logger.info("[VideoCallContext] calls-v2 media-bootstrap deferred by epoch guard", {
            callId,
            roomId,
            reason: blockReason,
            epoch: epochGuard.getEpoch(),
          });
          return;
        }

        logger.info("[VideoCallContext] calls-v2 media-bootstrap continuing to establish initial E2EE key", {
          callId,
          roomId,
          reason: blockReason,
          epoch: epochGuard.getEpoch(),
        });
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
          requireSenderReceiverAccessForE2ee: REQUIRE_SFRAME && hasE2eeSupport(),
          onTransportClosed: (transportId, direction) => {
            logger.error("[VideoCallContext] ICE restart exhausted — transport permanently closed", { transportId, direction });
            dispatchFsm("ERROR");
          },
        });
      }
      const sfuManager = sfuManagerRef.current;

// P0 fix: Register ICE restart callback after SfuMediaManager is created.
   // Without this, ICE restarts fail silently because onIceRestartNeeded is null.
   // CRITICAL FIX: During ICE restart, mediasoup-client generates NEW DTLS parameters
   // with fresh fingerprints. We must NOT send stale DTLS parameters — that breaks
   // DTLS handshake and causes SFU to close the transport ("firewall error").
   if (sfuManager && callsWsRef.current) {
     sfuManager.setIceRestartCallback(async (transportId, direction) => {
       logger.info("[VideoCallContext] ICE restart needed", { transportId, direction });
       const client = callsWsRef.current;
       if (!client) return;

       // Do NOT send any DTLS parameters here — mediasoup-client will invoke the
       // 'connect' event handler with fresh DTLS parameters from the ICE restart.
       // The connect handler (defined in createSendTransport/createRecvTransport below)
       // will be called automatically with the new parameters.
     });
   }

      // P0-3 fix: Register connection lost/restored callbacks to dispatch FSM events.
      // CONNECTION_LOST moves FSM to reconnecting state; CONNECTION_RESTORED returns to in_call.
      if (sfuManager) {
        sfuManager.setConnectionLostCallback((transportId, direction, reason) => {
          logger.warn("[VideoCallContext] connection lost reported by SFU transport", { transportId, direction, reason });
          const state = callStateRef.current;
          if (state === "in_call" || state === "media_ready" || state === "transport_connecting") {
            dispatchFsm("CONNECTION_LOST");
          }
        });

        sfuManager.setConnectionRestoredCallback((transportId, direction) => {
          logger.info("[VideoCallContext] connection restored reported by SFU transport", { transportId, direction });
          const state = callStateRef.current;
          if (state === "reconnecting") {
            dispatchFsm("CONNECTION_RESTORED");
          }
        });
      }

      const iceServersSnapshot = turnIceServersRef.current ?? undefined;
      if (iceServersSnapshot && iceServersSnapshot.length > 0) {
        logger.info("[VideoCallContext] TURN iceServers ready for SFU transports", { count: iceServersSnapshot.length });
      } else {
        logger.warn("[VideoCallContext] No TURN ice servers available — SFU will use STUN only (may fail behind strict NAT)");
      }

      await sfuManager.loadDevice(routerRtpCapabilities as import("mediasoup-client").types.RtpCapabilities);

      // P0 #6 fix: fail-closed if REQUIRE_SFRAME but no relay candidates.
      // Bootstrapping without TURN behind symmetric NAT (mobile/carrier-grade) = guaranteed ICE failure.
      if (REQUIRE_SFRAME && (!iceServersSnapshot || iceServersSnapshot.length === 0)) {
        const err = new Error(TURN_REQUIRED_MISSING_ERROR);
        logger.error("[VideoCallContext] TURN required for E2EE call but relay candidates unavailable — aborting bootstrap");
        reportMediaBootstrapFailure(roomId, callId, err);
        return;
      }

      // P0-1 fix: subscribe BEFORE sending transportCreate so we never miss the server event.
      // acceptRecent:false prevents matching a stale cached event from a previous bootstrap.
      const sendCreatedPromise = client.waitFor(
        "TRANSPORT_CREATED",
        (frame) => {
          const p = frame.payload as { roomId?: string; direction?: string } | undefined;
          return p?.roomId === roomId && p?.direction === "send";
        },
        { timeoutMs: 5000 }
      );
      void sendCreatedPromise.catch(() => undefined);
      await client.transportCreate({ roomId, direction: "send" });
      const sendCreated = await sendCreatedPromise;
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

      // P0-1 fix: same pattern for recv — subscribe before sending.
      const recvCreatedPromise = client.waitFor(
        "TRANSPORT_CREATED",
        (frame) => {
          const p = frame.payload as { roomId?: string; direction?: string } | undefined;
          return p?.roomId === roomId && p?.direction === "recv";
        },
        { timeoutMs: 5000 }
      );
      void recvCreatedPromise.catch(() => undefined);
      await client.transportCreate({ roomId, direction: "recv" });
      const recvCreated = await recvCreatedPromise;
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

       // Process pending producers now that recv transport is ready
       consumePendingProducersRef.current?.();

      // Create E2EE key BEFORE producing tracks (H-6 fix: must be set BEFORE setupSenderTransform).
      // FIX: reuse the epoch key already created during room bootstrap to avoid generating
      // a second key for the same epoch.  regenerate = epoch key reset in the encryptor and
      // media sent as plaintext until the new key propagates via REKEY_BEGIN/KEY_PACKAGE cycle.
      if (REQUIRE_SFRAME && hasE2eeSupport()) {
        const kx = callKeyExchangeRef.current;
        const enc = callMediaEncryptionRef.current;
        if (kx && enc) {
          const epoch = e2eeEpochRef.current ?? 0;
          let epochKey = kx.getActiveEpochKey();
          if (!epochKey || epochKey.epoch !== epoch) {
            // Bootstrap path: fast-track stage → activate.
            // Normal path activates only after REKEY_COMMIT quorum.
            epochKey = await kx.createStagedEpochKey(epoch);
            kx.activateEpochKey(epoch);
          }
          await enc.setEncryptionKey(epochKey);
          const decryptionKeysBefore = enc.getDecryptionPeerIds().length;
          logger.info("[VideoCallContext] calls-v2 initial E2EE key set", { roomId, epoch, decryptionKeysBefore });
        }
      }

      const tracks = stream.getTracks().filter((track) => track.readyState === "live");
      for (const track of tracks) {
        const source = track.kind === "audio" ? "microphone" : "camera";
        const producer = await sfuManager.produce(
          track,
          { trackId: track.id, source },
          REQUIRE_SFRAME && hasE2eeSupport()
            ? (sender, producerId) => callMediaEncryptionRef.current?.setupSenderTransform(sender, producerId)
            : undefined
        );
        if (track.kind === "audio" || track.kind === "video") {
          localProducerIdsRef.current[track.kind] = producer.id;
        }
      }

      if (REQUIRE_SFRAME && hasE2eeSupport()) {
          const readiness = canSendE2eeReady({
            epoch: e2eeEpochRef.current,
            mediaEncryption: callMediaEncryptionRef.current,
            rekeyMachine: rekeyMachineRef.current,
            missingSenderKeys: missingSenderKeysRef?.current,
            inbound: getInboundE2eeReadiness?.() ?? null,
            requireQuorum: false,
          });
          if (readiness.ready) {
            await client.e2eeReady({ roomId, epoch: e2eeEpochRef.current });
            epochGuardRef.current?.markE2eeReady(e2eeEpochRef.current);
            onE2eeReady?.();
            logger.info("[VideoCallContext] calls-v2 e2ee-ready:ok after media bootstrap", { roomId, epoch: e2eeEpochRef.current });
          } else {
            logger.warn("[VideoCallContext] calls-v2 E2EE_READY still deferred after media bootstrap", readiness);
          }
        }

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
    missingSenderKeysRef,
    getInboundE2eeReadiness,
    onE2eeReady,
    markMediaBootstrapProgress,
    mediaBootstrapBlockedUntilRef,
    mediaBootstrapErrorLogAtRef,
    mediaBootstrapToastShownRef,
    pendingProducersToConsumeRef,
    producerPeerKeyRef,
    rekeyMachineRef,
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
