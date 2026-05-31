/**
 * Call Cleanup Hook — manages all cleanup logic for call resources.
 *
 * Responsibility:
 *  - Cleanup all call resources (WS, SFU, media, crypto)
 *  - Clear all refs and timers
 *  - Provide single cleanup function for the Provider
 */

import { useCallback } from "react";
import type { RefObject } from "react";
import type { SfuMediaManager } from "@/calls-v2/sfuMediaManager";
import type { CallsWsClient } from "@/calls-v2/wsClient";
import type { CallMediaEncryption } from "@/calls-v2/callMediaEncryption";
import type { CallKeyExchange } from "@/calls-v2/callKeyExchange";
import type { RekeyStateMachine } from "@/calls-v2/rekeyStateMachine";
import type { EpochGuard } from "@/calls-v2/epochGuard";
import type { ConsumerReplayDescriptor } from "@/calls-v2/types";

interface CleanupRefs {
  sfuManagerRef: RefObject<SfuMediaManager | null>;
  callsWsRef: RefObject<CallsWsClient | null>;
  callKeyExchangeRef: RefObject<CallKeyExchange | null>;
  callMediaEncryptionRef: RefObject<CallMediaEncryption | null>;
  rekeyMachineRef: RefObject<RekeyStateMachine | null>;
  epochGuardRef: RefObject<EpochGuard | null>;

  // Timer refs
  relayMetricsTimerRef: RefObject<number | null>;
  rekeyTimerRef: RefObject<number | null>;
  unansweredCallTimerRef: RefObject<number | null>;

  // Media refs
  localProducerIdsRef: RefObject<{ audio: string | null; video: string | null }>;
  remoteTrackListenerCleanupsRef: RefObject<Array<() => void>>;

  // WS state refs
  callsWsCallIdRef: RefObject<string | null>;
  callsWsRoomRef: RefObject<string | null>;
  lastSnapshotRoomVersionRef: RefObject<number>;
  callsWsMediaRoomRef: RefObject<string | null>;
  callsWsMediaBootstrapInFlightRoomRef: RefObject<string | null>;
  callsWsSendTransportRef: RefObject<string | null>;
  callsWsRecvTransportRef: RefObject<string | null>;

  // E2EE refs
  e2eeLeaderDeviceRef: RefObject<string | null>;
  keyPackageNonceRef: RefObject<Set<string>>;
  keyPackageNonceTimestampsRef: RefObject<Map<string, number>>;

  // Bootstrap tracking refs
  consumerAddedUnsubRef: RefObject<(() => void) | null>;
  consumerListenerBoundClientRef: RefObject<CallsWsClient | null>;
  producerAddedUnsubRef: RefObject<(() => void) | null>;

  // Media bootstrap tracking
  mediaBootstrapBlockedUntilRef: RefObject<Map<string, number>>;
  mediaBootstrapErrorLogAtRef: RefObject<Map<string, number>>;
  mediaBootstrapToastShownRef: RefObject<Set<string>>;
  mediaBootstrapRetryAttemptsRef: RefObject<Map<string, number>>;
  mediaBootstrapCompletedRef: RefObject<Map<string, boolean>>;

  // Consumer/replay refs
  processedConsumerIdsRef: RefObject<Set<string>>;
  consumerCreateParamsRef: RefObject<Map<string, ConsumerReplayDescriptor>>;
  producerPeerKeyRef: RefObject<Map<string, string>>;
  peerUserIdByDeviceIdRef: RefObject<Map<string, string>>;
  pendingProducersToConsumeRef: RefObject<Map<string, { roomId: string; peerDeviceId?: string; peerUserId?: string }>>;
  consumePendingProducersRef: RefObject<(() => void) | null>;
  pendingReceiverTransformsRef: RefObject<Map<string, { receiver: RTCRtpReceiver; peerKey: string; deferredAt: number; recoveryRequested: boolean }>>;
  pipeBreakRetryAtRef: RefObject<Map<string, number>>;
  pipeBreakRecoveryInFlightRef: RefObject<Set<string>>;
  lastCallsBootstrapErrorRef: RefObject<Error | null>;
}

interface CleanupCallbacks {
  setRemoteMediaStream: (stream: null) => void;
  setRemoteScreenStream: (stream: null) => void;
  setIsE2eeActive: (v: boolean) => void;
}

export function useCallCleanup(
  refs: CleanupRefs,
  callbacks: CleanupCallbacks
) {
  const closeCallsV2 = useCallback(() => {
    // Clear timers
    if (refs.unansweredCallTimerRef.current) {
      window.clearTimeout(refs.unansweredCallTimerRef.current);
      refs.unansweredCallTimerRef.current = null;
    }
    if (refs.relayMetricsTimerRef.current) {
      window.clearInterval(refs.relayMetricsTimerRef.current);
      refs.relayMetricsTimerRef.current = null;
    }
    if (refs.rekeyTimerRef.current) {
      window.clearInterval(refs.rekeyTimerRef.current);
      refs.rekeyTimerRef.current = null;
    }

    // Cleanup SFU manager
    if (refs.sfuManagerRef.current) {
      refs.sfuManagerRef.current.close();
      refs.sfuManagerRef.current = null;
    }

    // Cleanup remote track listeners
    for (const cleanup of refs.remoteTrackListenerCleanupsRef.current) {
      cleanup();
    }
    refs.remoteTrackListenerCleanupsRef.current = [];

    // Reset local producers
    refs.localProducerIdsRef.current = { audio: null, video: null };

    // Cleanup WS listeners
    if (refs.consumerAddedUnsubRef.current) {
      refs.consumerAddedUnsubRef.current();
      refs.consumerAddedUnsubRef.current = null;
    }
    refs.consumerListenerBoundClientRef.current = null;
    refs.processedConsumerIdsRef.current.clear();

    if (refs.producerAddedUnsubRef.current) {
      refs.producerAddedUnsubRef.current();
      refs.producerAddedUnsubRef.current = null;
    }

    // Clear media streams
    callbacks.setRemoteMediaStream(null);
    callbacks.setRemoteScreenStream(null);

    // Clear SFU capabilities
    refs.callsWsCallIdRef.current = null;
    refs.callsWsRoomRef.current = null;
    refs.lastSnapshotRoomVersionRef.current = -1;
    refs.callsWsMediaRoomRef.current = null;
    refs.callsWsMediaBootstrapInFlightRoomRef.current = null;
    refs.callsWsSendTransportRef.current = null;
    refs.callsWsRecvTransportRef.current = null;

    // Destroy E2EE key material
    refs.callKeyExchangeRef.current?.destroy();
    refs.callKeyExchangeRef.current = null;
    refs.callMediaEncryptionRef.current?.destroy();
    refs.callMediaEncryptionRef.current = null;

    // Destroy rekey machine and epoch guard
    refs.rekeyMachineRef.current?.destroy();
    refs.rekeyMachineRef.current = null;
    refs.epochGuardRef.current?.markRoomLeft();
    refs.epochGuardRef.current = null;

    // Close WS connection
    if (refs.callsWsRef.current) {
      refs.callsWsRef.current.close();
      refs.callsWsRef.current = null;
    }

    // Clear E2EE state
    refs.e2eeLeaderDeviceRef.current = null;
    refs.keyPackageNonceRef.current.clear();
    refs.keyPackageNonceTimestampsRef.current.clear();
    callbacks.setIsE2eeActive(false);

    // Clear error tracking
    refs.lastCallsBootstrapErrorRef.current = null;

    // Clear media bootstrap tracking
    refs.mediaBootstrapBlockedUntilRef.current.clear();
    refs.mediaBootstrapErrorLogAtRef.current.clear();
    refs.mediaBootstrapToastShownRef.current.clear();
    refs.mediaBootstrapRetryAttemptsRef.current.clear();
    refs.mediaBootstrapCompletedRef.current.clear();

    // Clear consumer tracking
    refs.consumerCreateParamsRef.current.clear();
    refs.producerPeerKeyRef.current.clear();
    refs.pendingProducersToConsumeRef.current.clear();
    refs.consumePendingProducersRef.current = null;
    refs.peerUserIdByDeviceIdRef.current.clear();
    refs.pendingReceiverTransformsRef.current.clear();
    refs.pipeBreakRetryAtRef.current.clear();
    refs.pipeBreakRecoveryInFlightRef.current.clear();
  }, [refs, callbacks]);

  return { closeCallsV2 };
}