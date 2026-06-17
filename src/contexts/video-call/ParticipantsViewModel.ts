/**
 * ParticipantsViewModel — consumer/producer lifecycle, CONSUER_ADDED handler,
 * PRODUCE tracking, producer coverage probe, native call bridge.
 *
 * Ownership:
 *  - CONSUMER_ADDED event handling
 *  - consumer creation and lifecycle
 *  - track listeners (ended/mute/unmute)
 *  - producerId → peerKey mapping
 *  - native call action bridge (end/disconnect)
 *
 * NOT owned here:
 *  - SfuMediaManager creation/destruction → useCallsV2Bootstrap
 *  - E2EE key exchange lifecycle → E2eeViewModel
 *  - Call FSM dispatch → SignalingViewModel / Provider
 *  - closeCallsV2 orchestration → Provider
 *
 * Exposes: participants management + cleanup
 */

import { useCallback, useRef, useEffect } from "react";
import { logger } from "@/lib/logger";
import { onNativeCallAction } from "@/lib/native/callBridge";
import { getStableCallsDeviceId } from "@/lib/platform/device";
import type { ConsumerAddedPayload, ConsumerReplayDescriptor } from "@/calls-v2/types";
import type { VideoCall } from "@/hooks/useVideoCallSfu";
import { REQUIRE_SFRAME, hasE2eeSupport } from "./videoCallProvider.helpers";

interface ParticipantsViewModelDeps {
  user: { id: string } | null;
  legacyEngineActive: boolean;
  callsWsRef: React.MutableRefObject<import("@/calls-v2/wsClient").CallsWsClient | null>;
  callsWsRoomRef: React.MutableRefObject<string | null>;
  callsWsCallIdRef: React.MutableRefObject<string | null>;
  sfuManagerRef: React.MutableRefObject<import("@/calls-v2/sfuMediaManager").SfuMediaManager | null>;
  localProducerIdsRef: React.MutableRefObject<{ audio: string | null; video: string | null }>;
  producerPeerKeyRef: React.MutableRefObject<Map<string, string>>;
  peerUserIdByDeviceIdRef: React.MutableRefObject<Map<string, string>>;
  pendingProducersToConsumeRef: React.MutableRefObject<Map<string, {
    roomId: string;
    peerDeviceId?: string;
    peerUserId?: string;
  }>>;
  pendingReceiverTransformsRef: React.MutableRefObject<Map<string, {
    consumerId: string; producerId: string; peerKey: string;
    roomId: string; createdAt: number; attempts: number; timeoutId: number | null;
  }>>;
  consumerCreateParamsRef: React.MutableRefObject<Map<string, ConsumerReplayDescriptor>>;
  processedConsumerIdsRef: React.MutableRefObject<Set<string>>;
  rebuildRemoteStream: () => void;
  queueReceiverTransform: (params: {
    consumerId: string; producerId: string; peerKey: string; roomId: string; reason: string;
  }) => boolean;
  retryPendingReceiverTransformsForPeer: (peerKey: string) => void;
  retryAllPendingReceiverTransforms: (reason: string) => void;
  tryAttachPendingReceiverTransform: (consumerId: string, reason: string) => boolean;
  pendingIncomingCall: VideoCall | null;
  currentCall: VideoCall | null;
  releaseMediaWithoutDbUpdate: () => void;
  closeCallsV2: () => void;
  setPendingIncomingCall: (call: VideoCall | null) => void;
  setPendingCalleeProfile: (profile: null) => void;
  setIsCallUiActive: (active: boolean) => void;
  setIsE2eeActive: (active: boolean) => void;
  dispatchFsm: (event: string) => void;
  onE2eeActivated?: () => void;
}

export function useParticipantsViewModel(deps: ParticipantsViewModelDeps) {
  const {
    user,
    legacyEngineActive,
    callsWsRef,
    callsWsRoomRef,
    callsWsCallIdRef,
    sfuManagerRef,
    localProducerIdsRef,
    producerPeerKeyRef,
    peerUserIdByDeviceIdRef,
    pendingProducersToConsumeRef,
    pendingReceiverTransformsRef,
    consumerCreateParamsRef,
    processedConsumerIdsRef,
    rebuildRemoteStream,
    queueReceiverTransform,
    retryPendingReceiverTransformsForPeer,
    retryAllPendingReceiverTransforms,
    tryAttachPendingReceiverTransform,
    pendingIncomingCall,
    currentCall,
    releaseMediaWithoutDbUpdate,
    closeCallsV2,
    setPendingIncomingCall,
    setPendingCalleeProfile,
    setIsCallUiActive,
    setIsE2eeActive,
    dispatchFsm,
    onE2eeActivated,
  } = deps;

  const consumerAddedUnsubRef = useRef<(() => void) | null>(null);
  const consumerListenerBoundClientRef = useRef<import("@/calls-v2/wsClient").CallsWsClient | null>(null);
  const producerAddedUnsubRef = useRef<(() => void) | null>(null);
  const remoteTrackListenerCleanupsRef = useRef<Array<() => void>>([]);

  // ─── CONSUMER_ADDED handler ───────────────────────────────────────
  const handleConsumerAdded = useCallback((frame: { payload: unknown }) => {
    const payload = frame.payload as ConsumerAddedPayload | undefined;
    if (!payload?.consumer) return;

    const c = payload.consumer;
    const stableDeviceId = getStableCallsDeviceId();

    // Ignore consumers for other devices
    if (c.consumerDeviceId !== stableDeviceId) {
      logger.debug("[ParticipantsVM] CONSUMER_ADDED ignored: deviceId mismatch", {
        consumerId: c.consumerId,
        producerId: c.producerId,
        consumerDeviceId: c.consumerDeviceId,
        stableDeviceId,
      });
      return;
    }

    const roomId = callsWsRoomRef.current;
    if (!roomId || payload.roomId !== roomId) {
      logger.debug("[ParticipantsVM] CONSUMER_ADDED ignored: room mismatch", {
        consumerId: c.consumerId,
        payloadRoomId: payload.roomId,
        roomId,
      });
      return;
    }

    // Skip own producers
    const isOwnProducer =
      c.ownerUserId === user?.id && c.ownerDeviceId === stableDeviceId;
    const isLocalProducerFallback =
      c.producerId === localProducerIdsRef.current.audio ||
      c.producerId === localProducerIdsRef.current.video;

    if (isOwnProducer && !isLocalProducerFallback) {
      logger.warn("[ParticipantsVM] skip self-consumer", {
        consumerId: c.consumerId,
        producerId: c.producerId,
      });
      return;
    }

    const peerKey = `${c.ownerUserId}:${c.ownerDeviceId}`;
    producerPeerKeyRef.current.set(c.producerId, peerKey);
    peerUserIdByDeviceIdRef.current.set(c.consumerDeviceId, c.ownerUserId);

    logger.debug("[ParticipantsVM] CONSUMER_ADDED", {
      consumerId: c.consumerId,
      producerId: c.producerId,
      kind: c.kind,
      roomId: roomId.slice(0, 8),
    });

    const manager = sfuManagerRef.current;
    if (!manager) return;

    // Dedup
    if (processedConsumerIdsRef.current.has(c.consumerId)) {
      logger.debug("[ParticipantsVM] CONSUMER_ADDED dedup skip", { consumerId: c.consumerId });
      return;
    }
    processedConsumerIdsRef.current.add(c.consumerId);

    void manager.consume({
      id: c.consumerId,
      producerId: c.producerId,
      kind: c.kind as import("mediasoup-client").types.MediaKind,
      rtpParameters: payload.rtpParameters as import("mediasoup-client").types.RtpParameters,
      source: c.source,
    }).then((consumer) => {
      const descriptor: ConsumerReplayDescriptor = {
        consumerId: c.consumerId,
        producerId: c.producerId,
        kind: c.kind,
        source: c.source,
        ownerUserId: c.ownerUserId,
        ownerDeviceId: c.ownerDeviceId,
        rtpParameters: payload.rtpParameters,
      };
      consumerCreateParamsRef.current.set(consumer.id, descriptor);

      const consumerTrack = consumer.track;
      if (consumerTrack) {
        const expectedCallId = callsWsCallIdRef.current;
        const onTrackChanged = () => {
          if (callsWsCallIdRef.current !== expectedCallId) return;
          rebuildRemoteStream();
        };
        consumerTrack.addEventListener("ended", onTrackChanged);
        consumerTrack.addEventListener("mute", onTrackChanged);
        consumerTrack.addEventListener("unmute", onTrackChanged);
        remoteTrackListenerCleanupsRef.current.push(() => {
          consumerTrack.removeEventListener("ended", onTrackChanged);
          consumerTrack.removeEventListener("mute", onTrackChanged);
          consumerTrack.removeEventListener("unmute", onTrackChanged);
        });
      }

      const useSframe = REQUIRE_SFRAME && hasE2eeSupport();
      if (useSframe) {
        const attached = queueReceiverTransform({
          consumerId: consumer.id,
          producerId: c.producerId,
          peerKey,
          roomId,
          reason: "consumer-added",
        });
        retryAllPendingReceiverTransforms("consumer-added-replay");
        if (!attached) {
          logger.warn("[ParticipantsVM] consumer resume deferred until E2EE transform attaches", {
            consumerId: consumer.id,
            producerId: c.producerId,
          });
          return;
        }
      }

      return callsWsRef.current?.consumerResume({ roomId, consumerId: consumer.id }).then(() => {
        if (callsWsRoomRef.current !== roomId) return;
        rebuildRemoteStream();
      });
    }).catch((err) => {
      processedConsumerIdsRef.current.delete(c.consumerId);
      logger.error("[ParticipantsVM] consume/resume failed", err);
    });
  }, [
    user, callsWsRef, callsWsRoomRef, callsWsCallIdRef, sfuManagerRef,
    localProducerIdsRef, producerPeerKeyRef, peerUserIdByDeviceIdRef,
    consumerCreateParamsRef, processedConsumerIdsRef, rebuildRemoteStream,
    queueReceiverTransform, retryAllPendingReceiverTransforms,
  ]);

  // ─── Bind CONSUMER_ADDED to WS client ───────────────────────────
  useEffect(() => {
    if (legacyEngineActive) return;
    const client = callsWsRef.current;
    if (!client || consumerListenerBoundClientRef.current === client) return;

    consumerAddedUnsubRef.current?.();

    consumerAddedUnsubRef.current = client.on("CONSUMER_ADDED", handleConsumerAdded, { replay: true });
    consumerListenerBoundClientRef.current = client;
  });

  // ─── Native call bridge ─────────────────────────────────────────
  useEffect(() => {
    if (legacyEngineActive) return;
    return onNativeCallAction(async (action) => {
      const actionType = action.type;
      const matchesIncoming = pendingIncomingCall?.id === action.callId;
      const matchesCurrent = currentCall?.id === action.callId;

      if ((actionType === "accept" || actionType === "answer") && matchesIncoming) {
        // handled by SignalingViewModel
        return;
      }

      if ((actionType === "decline" || actionType === "reject") && matchesIncoming) {
        // handled by SignalingViewModel
        return;
      }

      if ((actionType === "end" || actionType === "disconnect") && matchesCurrent) {
        logger.warn("[ParticipantsVM] Native end/disconnect — local teardown", { callId: action.callId });
        dispatchFsm("CALL_END");
        releaseMediaWithoutDbUpdate();
        closeCallsV2();
        setPendingIncomingCall(null);
        setPendingCalleeProfile(null);
        setIsCallUiActive(false);
        setIsE2eeActive(false);
        dispatchFsm("CLEANUP_DONE");
        dispatchFsm("RESET");
        return;
      }
    });
  }, [
    legacyEngineActive, pendingIncomingCall, currentCall, dispatchFsm,
    releaseMediaWithoutDbUpdate, closeCallsV2,
    setPendingIncomingCall, setPendingCalleeProfile, setIsCallUiActive, setIsE2eeActive,
  ]);

  // ─── Cleanup ────────────────────────────────────────────────────
  const cleanupParticipants = useCallback(() => {
    for (const cleanup of remoteTrackListenerCleanupsRef.current) cleanup();
    remoteTrackListenerCleanupsRef.current = [];
    consumerAddedUnsubRef.current?.();
    consumerAddedUnsubRef.current = null;
    producerAddedUnsubRef.current?.();
    producerAddedUnsubRef.current = null;
    consumerListenerBoundClientRef.current = null;
    processedConsumerIdsRef.current.clear();
    consumerCreateParamsRef.current.clear();
    producerPeerKeyRef.current.clear();
    peerUserIdByDeviceIdRef.current.clear();
    pendingProducersToConsumeRef.current.clear();
    // Clear pending receiver transforms
    for (const pending of pendingReceiverTransformsRef.current.values()) {
      if (pending.timeoutId !== null) window.clearTimeout(pending.timeoutId);
    }
    pendingReceiverTransformsRef.current.clear();
  }, [
    processedConsumerIdsRef, consumerCreateParamsRef, producerPeerKeyRef,
    peerUserIdByDeviceIdRef, pendingProducersToConsumeRef, pendingReceiverTransformsRef,
  ]);

  return {
    cleanupParticipants,
    handleConsumerAdded,
    remoteTrackListenerCleanupsRef,
    consumerAddedUnsubRef,
    producerAddedUnsubRef,
    consumerListenerBoundClientRef,
  };
}
