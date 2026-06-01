import { useEffect, type MutableRefObject } from "react";
import { logger } from "@/lib/logger";
import { getStableCallsDeviceId } from "@/lib/platform/device";
import type { SfuMediaManager } from "@/calls-v2/sfuMediaManager";
import type { CallsWsClient } from "@/calls-v2/wsClient";
import type { ConsumerAddedPayload, ConsumerReplayDescriptor } from "@/calls-v2/types";
import { REQUIRE_SFRAME, hasE2eeSupport } from "./videoCallProvider.helpers";

interface Params {
  user: { id: string } | null;
  callsWsRef: MutableRefObject<CallsWsClient | null>;
  callsWsRoomRef: MutableRefObject<string | null>;
  callsWsMediaRoomRef: MutableRefObject<string | null>;
  callsWsCallIdRef: MutableRefObject<string | null>;
  sfuManagerRef: MutableRefObject<SfuMediaManager | null>;
  callMediaEncryptionRef: MutableRefObject<import("@/calls-v2/callMediaEncryption").CallMediaEncryption | null>;
  localProducerIdsRef: MutableRefObject<{ audio: string | null; video: string | null }>;
  producerPeerKeyRef: MutableRefObject<Map<string, string>>;
  consumerCreateParamsRef: MutableRefObject<Map<string, ConsumerReplayDescriptor>>;
  processedConsumerIdsRef: MutableRefObject<Set<string>>;
  consumerAddedUnsubRef: MutableRefObject<(() => void) | null>;
  consumerListenerBoundClientRef: MutableRefObject<CallsWsClient | null>;
  remoteTrackListenerCleanupsRef: MutableRefObject<Array<() => void>>;
  rebuildRemoteStream: () => void;
}

export function useConsumerAdded({
  user,
  callsWsRef,
  callsWsRoomRef,
  callsWsMediaRoomRef,
  callsWsCallIdRef,
  sfuManagerRef,
  callMediaEncryptionRef,
  localProducerIdsRef,
  producerPeerKeyRef,
  consumerCreateParamsRef,
  processedConsumerIdsRef,
  consumerAddedUnsubRef,
  consumerListenerBoundClientRef,
  remoteTrackListenerCleanupsRef,
  rebuildRemoteStream,
}: Params) {
  // Invariant: exactly one listener per CallsWsClient instance.
  useEffect(() => {
    const client = callsWsRef.current;
    if (!client || consumerListenerBoundClientRef.current === client) return;

    consumerAddedUnsubRef.current?.();

    consumerAddedUnsubRef.current = client.on("CONSUMER_ADDED", (frame) => {
      const payload = frame.payload as ConsumerAddedPayload | undefined;
      if (!payload?.consumer) return;
      const c = payload.consumer;
      const stableDeviceId = getStableCallsDeviceId();

      if (c.consumerDeviceId !== stableDeviceId) {
        logger.debug("[useConsumerAdded] ignored: consumerDeviceId mismatch", {
          consumerId: c.consumerId,
          consumerDeviceId: c.consumerDeviceId,
          stableDeviceId,
        });
        return;
      }

      const bootstrapRoomId = callsWsRoomRef.current;
      const roomId = callsWsMediaRoomRef.current ?? bootstrapRoomId;
      if (!roomId || payload.roomId !== roomId) {
        logger.debug("[useConsumerAdded] ignored: room mismatch", {
          consumerId: c.consumerId,
          payloadRoomId: payload.roomId,
          mediaRoomId: callsWsMediaRoomRef.current,
          bootstrapRoomId,
        });
        return;
      }

      const localDeviceId = stableDeviceId;
      const isOwnProducer = c.ownerUserId === user?.id && c.ownerDeviceId === localDeviceId;
      const localProducerIds = localProducerIdsRef.current;
      const isLocalProducerFallback =
        c.producerId === localProducerIds.audio || c.producerId === localProducerIds.video;

      if (isOwnProducer || isLocalProducerFallback) {
        if (isOwnProducer && !isLocalProducerFallback) {
          logger.warn("[useConsumerAdded] skip self-consumer", {
            consumerId: c.consumerId,
            ownerDeviceId: c.ownerDeviceId,
          });
        }
        return;
      }

      const peerKey = `${c.ownerUserId}:${c.ownerDeviceId}`;
      producerPeerKeyRef.current.set(c.producerId, peerKey);

      logger.debug("[useConsumerAdded] CONSUMER_ADDED", {
        consumerId: c.consumerId,
        producerId: c.producerId,
        kind: c.kind,
        roomId: roomId.slice(0, 8),
      });

      const sfuManager = sfuManagerRef.current;
      if (!sfuManager) return;

      // Dedup: process each consumerId exactly once.
      // Roll back on consume error so recovery can retry.
      if (processedConsumerIdsRef.current.has(c.consumerId)) {
        logger.debug("[useConsumerAdded] dedup skip", { consumerId: c.consumerId });
        return;
      }
      processedConsumerIdsRef.current.add(c.consumerId);

      void sfuManager.consume({
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

        if (REQUIRE_SFRAME && hasE2eeSupport()) {
          const enc = callMediaEncryptionRef.current;
          const receiver = sfuManagerRef.current?.getConsumerReceiver(consumer.id);
          if (receiver && enc) {
            enc.setupReceiverTransform(receiver, peerKey, consumer.id);
          }
        }

        return client.consumerResume({ roomId, consumerId: consumer.id }).then(() => {
          if (callsWsMediaRoomRef.current !== roomId) return;
          rebuildRemoteStream();
        });
      }).catch((err) => {
        processedConsumerIdsRef.current.delete(c.consumerId);
        logger.error("[useConsumerAdded] consume/resume failed", err);
      });
    }, { replay: true });

    consumerListenerBoundClientRef.current = client;
  });
}
