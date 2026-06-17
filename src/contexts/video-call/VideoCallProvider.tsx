/**
 * VideoCallProvider — Composition root.
 *
 * Architecture:
 *  This component wires four ViewModels and provides THREE React contexts:
 *    1. VideoCallSignalingContext  — call lifecycle + FSM
 *    2. VideoCallMediaContext      — streams + mute/video toggles
 *    3. VideoCallUIContext         — UI-lock flag
 *
 * Initialization order (required for circular refs):
 *  1. All shared refs (mutable, no re-render)
 *  2. useE2eeViewModel + useSignalingViewModel (FSM)
 *  3. useCallsV2Bootstrap (needs signaling VM callbacks)
 *  4. useMediaViewModel (needs bootstrap + turns credentials)
 *  5. useCallsV2MediaBootstrap (needs bootstrap)
 *  6. useParticipantsViewModel (needs bootstrap + media)
 *  7. Wire everything together
 *  8. closeCallsV2 (stable, last)
 *
 * Re-render isolation:
 *  - isCallUiActive changes     → ONLY VideoCallUIContext consumers re-render
 *  - isMuted/streams change     → ONLY VideoCallMediaContext consumers re-render
 *  - status/callState changes   → ONLY VideoCallSignalingContext consumers re-render
 *
 * Security:
 *  - No TURN credentials, ECDH keys, or ECDSA private keys in context values.
 *    All cryptographic material lives in refs and never leaves this component.
 */

import { ReactNode, useRef, useEffect, useMemo, useState } from "react";
import { logger } from "@/lib/logger";
import { getStableCallsDeviceId } from "@/lib/platform/device";
import { SfuMediaManager } from "@/calls-v2/sfuMediaManager";
import { CallsWsClient } from "@/calls-v2/wsClient";
import {
  CALLS_V2_ENDPOINTS,
  expandWsEndpoints,
  getCallsConfigIssue,
  hasE2eeSupport,
  MEDIA_BOOTSTRAP_MAX_RETRIES,
  getCallsConfigToastDescription,
  getCallsBootstrapToastPayload,
  getMediaPermissionToastPayload,
  isMediaErrorForCall,
} from "./videoCallProvider.helpers";
import type { RtpCapabilities } from "@/calls-v2/types";
import type { VideoCall } from "@/hooks/useVideoCallSfu";
import { isCallActive, isCallConnecting, transition, type CallState, type CallEvent } from "@/calls-v2/callStateMachine";
import { useCallsV2Bootstrap } from "./useCallsV2Bootstrap";
import { useCallsV2MediaBootstrap } from "./useCallsV2MediaBootstrap";
import { useE2eePipeBreakRecovery } from "./useE2eePipeBreakRecovery";
import { useProducerCoverageProbe } from "./useProducerCoverageProbe";
import { VideoCallSignalingContext } from "./VideoCallSignalingContext";
import { VideoCallMediaContext } from "./VideoCallMediaContext";
import { VideoCallUIContext } from "./VideoCallUIContext";
import { useSignalingViewModel } from "./SignalingViewModel";
import { useMediaViewModel } from "./MediaViewModel";
import { useE2eeViewModel } from "./E2eeViewModel";
import { useParticipantsViewModel } from "./ParticipantsViewModel";
import { useAuth } from "@/hooks/useAuth";

export function VideoCallProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const legacyEngineActive = false;

  // ─── Phase 1: All shared refs (no re-render, no initialization order constraints) ─
  const callsWsRef = useRef<CallsWsClient | null>(null);
  const connectingPromiseRef = useRef<Promise<CallsWsClient | null> | null>(null);
  const sfuManagerRef = useRef<SfuMediaManager | null>(null);
  const sfuRouterRtpCapabilitiesRef = useRef<RtpCapabilities | null>(null);
  const callsWsCallIdRef = useRef<string | null>(null);
  const callsWsRoomRef = useRef<string | null>(null);
  const lastSnapshotRoomVersionRef = useRef<number>(-1);
  const callsWsMediaRoomRef = useRef<string | null>(null);
  const callsWsMediaBootstrapInFlightRoomRef = useRef<string | null>(null);
  const callsWsSendTransportRef = useRef<string | null>(null);
  const callsWsRecvTransportRef = useRef<string | null>(null);
  const localProducerIdsRef = useRef<{ audio: string | null; video: string | null }>({ audio: null, video: null });
  const activeCallsV2BootstrapCallIdRef = useRef<string | null>(null);
  const lastCallsBootstrapErrorRef = useRef<Error | null>(null);
  const rekeyTimerRef = useRef<number | null>(null);
  const e2eeEpochRef = useRef<number>(0);
  const unansweredCallTimerRef = useRef<number | null>(null);
  const mediaBootstrapBlockedUntilRef = useRef<Map<string, number>>(new Map());
  const mediaBootstrapErrorLogAtRef = useRef<Map<string, number>>(new Map());
  const mediaBootstrapToastShownRef = useRef<Set<string>>(new Set());
  const mediaBootstrapRetryAttemptsRef = useRef<Map<string, number>>(new Map());
  const mediaBootstrapCompletedRef = useRef<Map<string, boolean>>(new Map());
  const mediaBootstrapRetryCallIdRef = useRef<string | null>(null);
  const pendingProducersToConsumeRef = useRef<Map<string, { roomId: string; peerDeviceId?: string; peerUserId?: string }>>(new Map());
  const consumePendingProducersRef = useRef<(() => void) | null>(null);
  const pipeBreakRetryAtRef = useRef<Map<string, number>>(new Map());
  const pipeBreakRecoveryInFlightRef = useRef<Set<string>>(new Set());
  const handleE2eePipeBreakRef = useRef<((info: import("@/lib/e2ee/insertableStreams").PipeBreakInfo) => void) | null>(null);
  const remoteTrackListenerCleanupsRef = useRef<Array<() => void>>([]);
  const e2eeLeaderDeviceRef = useRef<string | null>(null);
  const producerAddedUnsubRef = useRef<(() => void) | null>(null);

  // Callbacks refs (initialized later)
  const bootstrapCallsV2MediaRef = useRef<((call: VideoCall, stream: MediaStream) => Promise<void>) | null>(null);
  const rebuildRemoteStreamRef = useRef<() => void>(() => {});
  const closeCallsV2Ref = useRef<() => void>(() => {});

  // ─── Phase 2: Signaling FSM state (needed by bootstrap hooks) ──────────
  const [callState, setCallState] = useState<CallState>("idle");
  const callStateRef = useRef<CallState>("idle");

  const dispatchFsm = (event: CallEvent): CallState => {
    const prev = callStateRef.current;
    const next = transition(prev, event);
    if (next === null) {
      logger.warn("[VCP] invalid FSM transition", { prev, event });
      return prev;
    }
    callStateRef.current = next;
    setCallState(next);
    logger.info("[VCP] FSM transition", { prev, event, next });
    return next;
  };

  const syncCallState = (next: CallState, reason: string) => {
    const prev = callStateRef.current;
    if (prev === next) return;
    callStateRef.current = next;
    setCallState(next);
    logger.warn("[VCP] FSM forced sync", { prev, next, reason });
  };

  // ─── Phase 3: Bootstrap hooks (need dispatchFsm/syncCallState) ─────────
  const {
    ensureCallsV2Connected,
    bootstrapCallsV2Room,
  } = useCallsV2Bootstrap({
    user,
    fetchTurnIceServers: () => mediaVM.fetchTurnIceServers(),
    setPendingIncomingCall: () => {},
    callsWsRef,
    connectingPromiseRef,
    sfuManagerRef,
    sfuRouterRtpCapabilitiesRef,
    callsWsCallIdRef,
    callsWsRoomRef,
    lastSnapshotRoomVersionRef,
    callsWsMediaRoomRef,
    callsWsMediaBootstrapInFlightRoomRef: callsWsMediaBootstrapInFlightRoomRef,
    callsWsSendTransportRef,
    callsWsRecvTransportRef,
    rekeyTimerRef,
    e2eeEpochRef,
    turnIceServersRef: useRef<RTCIceServer[] | null>(null),
    e2eeLeaderDeviceRef,
    keyPackageNonceRef: useRef<Set<string>>(new Set()),
    keyPackageNonceTimestampsRef: useRef<Map<string, number>>(new Map()),
    callKeyExchangeRef: useRef<import("@/calls-v2/callKeyExchange").CallKeyExchange | null>(null),
    callMediaEncryptionRef: useRef<import("@/calls-v2/callMediaEncryption").CallMediaEncryption | null>(null),
    rekeyMachineRef: useRef<import("@/calls-v2/rekeyStateMachine").RekeyStateMachine | null>(null),
    epochGuardRef: useRef<import("@/calls-v2/epochGuard").EpochGuard | null>(null),
    lastCallsBootstrapErrorRef,
    producerPeerKeyRef: useRef<Map<string, string>>(new Map()),
    peerUserIdByDeviceIdRef: useRef<Map<string, string>>(new Map()),
    pendingProducersToConsumeRef,
    consumePendingProducersRef,
    handleE2eePipeBreakRef,
    producerAddedUnsubRef,
    isCallStillActiveForBootstrap: (callId) => activeCallsV2BootstrapCallIdRef.current === callId,
    onE2eeActivated: () => {},
    onDecryptionKeyReady: () => {},
    hasInboundE2eeReadiness: () => false,
    getInboundE2eeReadiness: () => ({ ready: false, missingDecryptionPeers: [], pendingConsumers: [] }),
    missingSenderKeysRef: useRef<Set<string>>(new Set()),
  });

  // ─── Phase 4: ViewModels ──────────────────────────────────────────────
  // E2EE VM first (refs exposed to others)
  const e2eeVM = useE2eeViewModel({
    user,
    callsWsRef,
    callsWsRoomRef,
    e2eeEpochRef,
    e2eeLeaderDeviceRef,
    sfuManagerRef,
    rebuildRemoteStream: () => rebuildRemoteStreamRef.current(),
  });

  // Media VM (needs TURN credentials)
  const mediaVM = useMediaViewModel({
    user,
    legacyEngineActive,
    bootstrapCallsV2Media: (call, stream) => bootstrapCallsV2MediaRef.current?.(call, stream) ?? Promise.resolve(),
    rebuildRemoteStream: () => rebuildRemoteStreamRef.current(),
    callsWsRef,
    currentCall: null,
    pendingIncomingCall: null,
    isCallUiActive: false,
    callStateRef,
    dispatchFsm,
    isCallConnecting,
  });

  // Signaling VM (needs bootstrap + closeCallsV2)
  const signalingVM = useSignalingViewModel({
    legacyEngineActive,
    ensureCallsV2Connected,
    bootstrapCallsV2Room,
    closeCallsV2: () => closeCallsV2Ref.current?.(),
    callsWsRef,
    unansweredCallTimerRef,
    activeCallsV2BootstrapCallIdRef,
    lastCallsBootstrapErrorRef,
    onBootstrapOk: () => {
      if (isCallConnecting(callStateRef.current)) dispatchFsm("BOOTSTRAP_OK");
    },
  });

  // Media bootstrap (needs signaling VM's currentCall)
  const {
    rebuildRemoteStream: rebuildFromMedia,
    bootstrapCallsV2Media,
  } = useCallsV2MediaBootstrap({
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
    turnIceServersRef: mediaVM.turnIceServersRef,
    epochGuardRef: e2eeVM.epochGuardRef,
    e2eeEpochRef,
    callKeyExchangeRef: e2eeVM.callKeyExchangeRef,
    callMediaEncryptionRef: e2eeVM.callMediaEncryptionRef,
    rekeyMachineRef: e2eeVM.rekeyMachineRef,
    missingSenderKeysRef: e2eeVM.missingSenderKeysRef,
    localProducerIdsRef,
    onE2eeReady: () => e2eeVM.setIsE2eeActive(true),
    getInboundE2eeReadiness: () => e2eeVM.getInboundE2eeReadiness(),
    consumerCreateParamsRef: e2eeVM.consumerCreateParamsRef,
    producerPeerKeyRef: e2eeVM.producerPeerKeyRef,
    mediaBootstrapBlockedUntilRef,
    mediaBootstrapErrorLogAtRef,
    mediaBootstrapToastShownRef,
    mediaBootstrapCompletedRef,
    isScreenSharing: false,
    screenStream: null,
    setRemoteMediaStream: (s) => mediaVM.setRemoteMediaStream(s),
    setRemoteScreenStream: (s) => mediaVM.setRemoteScreenStream(s),
    callStateRef,
    dispatchFsm,
    isCallConnecting,
    canPromoteInCall: () => isCallActive(callState) || isCallConnecting(callState),
    markMediaBootstrapProgress: () => {},
    markMediaBootstrapFailed: () => {},
    pendingProducersToConsumeRef,
    consumePendingProducersRef,
  });

  // Participants VM (needs bootstrap + media + E2EE)
  const participantsVM = useParticipantsViewModel({
    user,
    legacyEngineActive,
    callsWsRef,
    callsWsRoomRef,
    callsWsCallIdRef,
    sfuManagerRef,
    localProducerIdsRef,
    producerPeerKeyRef: e2eeVM.producerPeerKeyRef,
    peerUserIdByDeviceIdRef: e2eeVM.peerUserIdByDeviceIdRef,
    pendingProducersToConsumeRef,
    pendingReceiverTransformsRef: e2eeVM.pendingReceiverTransformsRef,
    consumerCreateParamsRef: e2eeVM.consumerCreateParamsRef,
    processedConsumerIdsRef: e2eeVM.processedConsumerIdsRef,
    rebuildRemoteStream: () => rebuildRemoteStreamRef.current(),
    queueReceiverTransform: (p) => e2eeVM.queueReceiverTransform(p),
    retryPendingReceiverTransformsForPeer: (pk) => e2eeVM.retryPendingReceiverTransformsForPeer(pk),
    retryAllPendingReceiverTransforms: (r) => e2eeVM.retryAllPendingReceiverTransforms(r),
    tryAttachPendingReceiverTransform: (id, r) => e2eeVM.tryAttachPendingReceiverTransform(id, r),
    pendingIncomingCall: signalingVM.pendingIncomingCall,
    currentCall: signalingVM.signalingValue.currentCall,
    releaseMediaWithoutDbUpdate: () => mediaVM.releaseMediaWithoutDbUpdate(),
    closeCallsV2: () => closeCallsV2Ref.current?.(),
    setPendingIncomingCall: (c) => signalingVM.setPendingIncomingCall(c),
    setPendingCalleeProfile: (p) => signalingVM.setPendingCalleeProfile(p),
    setIsCallUiActive: (v) => signalingVM.setIsCallUiActive(v),
    setIsE2eeActive: (v) => e2eeVM.setIsE2eeActive(v),
    dispatchFsm: (e: string) => dispatchFsm(e as CallEvent),
    onE2eeActivated: () => e2eeVM.setIsE2eeActive(true),
  });

  // ─── Wire refs ────────────────────────────────────────────────────────
  bootstrapCallsV2MediaRef.current = bootstrapCallsV2Media;
  rebuildRemoteStreamRef.current = rebuildFromMedia;

  // ─── E2EE pipe break + coverage ───────────────────────────────────────
  useE2eePipeBreakRecovery(
    sfuManagerRef,
    e2eeVM.callMediaEncryptionRef,
    callsWsRef,
    callsWsMediaRoomRef,
    e2eeVM.consumerCreateParamsRef,
    localProducerIdsRef,
    e2eeVM.producerPeerKeyRef,
    pipeBreakRetryAtRef,
    pipeBreakRecoveryInFlightRef,
    handleE2eePipeBreakRef,
    () => rebuildRemoteStreamRef.current(),
    (id, r) => e2eeVM.tryAttachPendingReceiverTransform(id, r),
  );

  useProducerCoverageProbe(sfuManagerRef, callsWsRef, callsWsMediaRoomRef);

  // ─── Phase 5: closeCallsV2 (last, uses everything) ──────────────────
  useEffect(() => {
    closeCallsV2Ref.current = () => {
      if (unansweredCallTimerRef.current) {
        window.clearTimeout(unansweredCallTimerRef.current);
        unansweredCallTimerRef.current = null;
      }
      if (mediaVM.relayMetricsTimerRef.current) {
        window.clearInterval(mediaVM.relayMetricsTimerRef.current);
        mediaVM.relayMetricsTimerRef.current = null;
      }
      if (rekeyTimerRef.current) {
        window.clearInterval(rekeyTimerRef.current);
        rekeyTimerRef.current = null;
      }
      if (sfuManagerRef.current) {
        sfuManagerRef.current.close();
        sfuManagerRef.current = null;
      }
      participantsVM.cleanupParticipants();
      localProducerIdsRef.current = { audio: null, video: null };
      sfuRouterRtpCapabilitiesRef.current = null;
      e2eeVM.destroyKeyExchange();
      mediaVM.setRemoteScreenStream(null);
      mediaVM.setRemoteMediaStream(null);
      if (callsWsRef.current) {
        callsWsRef.current.destroy();
        callsWsRef.current = null;
      }
      callsWsCallIdRef.current = null;
      callsWsRoomRef.current = null;
      lastSnapshotRoomVersionRef.current = -1;
      callsWsMediaRoomRef.current = null;
      callsWsMediaBootstrapInFlightRoomRef.current = null;
      callsWsSendTransportRef.current = null;
      callsWsRecvTransportRef.current = null;
      lastCallsBootstrapErrorRef.current = null;
      mediaBootstrapBlockedUntilRef.current.clear();
      mediaBootstrapErrorLogAtRef.current.clear();
      mediaBootstrapToastShownRef.current.clear();
      mediaBootstrapRetryAttemptsRef.current.clear();
      mediaBootstrapCompletedRef.current.clear();
      pipeBreakRetryAtRef.current.clear();
      pipeBreakRecoveryInFlightRef.current.clear();
      activeCallsV2BootstrapCallIdRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      closeCallsV2Ref.current?.();
    };
  }, []);

  // ─── Config log ────────────────────────────────────────────────────────
  useEffect(() => {
    const issue = getCallsConfigIssue();
    logger.info("[VCP] calls-v2 config", {
      endpointCount: CALLS_V2_ENDPOINTS.length,
      hasE2eeSupport: hasE2eeSupport(),
    });
    if (!hasE2eeSupport()) {
      logger.warn("[VCP] E2EE not supported — browser lacks Insertable Streams API");
    }
  }, []);

  // ─── Context values ──────────────────────────────────────────────────
  const signalingValue = useMemo(() => signalingVM.signalingValue, [signalingVM.signalingValue]);

  const mediaValue = useMemo(() => ({
    ...mediaVM.mediaValue,
    isE2eeActive: e2eeVM.isE2eeActive,
  }), [mediaVM.mediaValue, e2eeVM.isE2eeActive]);

  const uiValue = useMemo(() => ({
    isCallUiActive: signalingVM.isCallUiActive,
  }), [signalingVM.isCallUiActive]);

  // ─── Render ────────────────────────────────────────────────────────
  return (
    <VideoCallSignalingContext.Provider value={signalingValue}>
      <VideoCallMediaContext.Provider value={mediaValue}>
        <VideoCallUIContext.Provider value={uiValue}>
          {children}
        </VideoCallUIContext.Provider>
      </VideoCallMediaContext.Provider>
    </VideoCallSignalingContext.Provider>
  );
}
