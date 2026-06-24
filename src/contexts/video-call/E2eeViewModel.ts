/**
 * E2eeViewModel — key exchange, rekey, epoch guard, pipe break recovery.
 *
 * Ownership:
 *  - CallKeyExchange lifecycle
 *  - CallMediaEncryption lifecycle
 *  - RekeyStateMachine lifecycle
 *  - EpochGuard lifecycle
 *  - E2EE_READY signaling
 *  - pending receiver transform queue
 *  - pipe break detection and recovery
 *  - inbound readiness tracking
 *
 * Exposes: isE2eeActive state + recovery helpers
 */

import { useCallback, useRef, useMemo, useState } from "react";
import { logger } from "@/lib/logger";
import { CallKeyExchange } from "@/calls-v2/callKeyExchange";
import { CallMediaEncryption } from "@/calls-v2/callMediaEncryption";
import { RekeyStateMachine } from "@/calls-v2/rekeyStateMachine";
import { EpochGuard } from "@/calls-v2/epochGuard";
import {
  getOrCreateIdentityKeyPair,
  signIdentity,
  exportPublicKey as exportEcdsaPublicKey,
} from "@/calls-v2/ecdsaIdentity";
import { getStableCallsDeviceId } from "@/lib/platform/device";
import type { ConsumerReplayDescriptor } from "@/calls-v2/types";
import type { PipeBreakInfo } from "@/lib/e2ee/insertableStreams";
import type { CallIdentity } from "@/calls-v2/callKeyExchange";
import { canSendE2eeReady } from "./videoCallProvider.helpers";

const PENDING_RECEIVER_TRANSFORM_TIMEOUT_MS = 15_000;

interface PendingReceiverTransform {
  consumerId: string;
  producerId: string;
  peerKey: string;
  roomId: string;
  createdAt: number;
  attempts: number;
  timeoutId: number | null;
}

interface InboundE2eeReadiness {
  ready: boolean;
  missingDecryptionPeers: string[];
  pendingConsumers: string[];
}

interface E2eeViewModelDeps {
  user: { id: string } | null;
  callsWsRef: React.MutableRefObject<import("@/calls-v2/wsClient").CallsWsClient | null>;
  callsWsRoomRef: React.MutableRefObject<string | null>;
  e2eeEpochRef: React.MutableRefObject<number>;
  e2eeLeaderDeviceRef: React.MutableRefObject<string | null>;
  sfuManagerRef: React.MutableRefObject<import("@/calls-v2/sfuMediaManager").SfuMediaManager | null>;
  rebuildRemoteStream: () => void;
  missingSenderKeysRef?: React.MutableRefObject<Set<string>>;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    if (byte === undefined) continue;
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function useE2eeViewModel(deps: E2eeViewModelDeps) {
  const {
    user,
    callsWsRef,
    callsWsRoomRef,
    e2eeEpochRef,
    e2eeLeaderDeviceRef,
    sfuManagerRef,
    rebuildRemoteStream,
    missingSenderKeysRef,
  } = deps;

  // ─── Internal refs — declare BEFORE use ─────────────────────────
  const processedConsumerIdsRef = useRef<Set<string>>(new Set());

  const callKeyExchangeRef = useRef<CallKeyExchange | null>(null);
  const callMediaEncryptionRef = useRef<CallMediaEncryption | null>(null);
  const rekeyMachineRef = useRef<RekeyStateMachine | null>(null);
  const epochGuardRef = useRef<EpochGuard | null>(null);

  const keyPackageNonceRef = useRef<Set<string>>(new Set());
  const keyPackageNonceTimestampsRef = useRef<Map<string, number>>(new Map());

  const producerPeerKeyRef = useRef<Map<string, string>>(new Map());
  const peerUserIdByDeviceIdRef = useRef<Map<string, string>>(new Map());
  const _missingSenderKeysRef = useRef<Set<string>>(new Set());
  if (missingSenderKeysRef) _missingSenderKeysRef.current = missingSenderKeysRef.current;

  const pendingReceiverTransformsRef = useRef<Map<string, PendingReceiverTransform>>(new Map());
  const consumerCreateParamsRef = useRef<Map<string, ConsumerReplayDescriptor>>(new Map());

  // Pipe break recovery
  const pipeBreakRetryAtRef = useRef<Map<string, number>>(new Map());
  const pipeBreakRecoveryInFlightRef = useRef<Set<string>>(new Set());
  const handleE2eePipeBreakRef = useRef<((info: PipeBreakInfo) => void) | null>(null);

  // Deferred readiness sender
  const maybeSendE2eeReadyRef = useRef<() => void>(() => undefined);

  // ─── E2EE active state ───────────────────────────────────────────
  const [isE2eeActive, setIsE2eeActive] = useState(false);

  // ─── Key exchange lifecycle ─────────────────────────────────────
  const initKeyExchange = useCallback((callIdentity: CallIdentity) => {
    const kx = new CallKeyExchange(callIdentity);
    callKeyExchangeRef.current = kx;

    const enc = new CallMediaEncryption();
    callMediaEncryptionRef.current = enc;

    const rekey = new RekeyStateMachine();
    rekey.onEvent((event) => {
      if (event.type === 'QUORUM_REACHED') {
        logger.info("[E2eeVM] Rekey quorum reached");
        maybeSendE2eeReadyRef.current();
      } else if (event.type === 'DEADLINE_EXCEEDED' || event.type === 'REKEY_ABORTED') {
        logger.warn("[E2eeVM] Rekey timeout/abort — marking room left");
        epochGuardRef.current?.markRoomLeft();
      }
    });
    rekeyMachineRef.current = rekey;

    const guard = new EpochGuard();
    epochGuardRef.current = guard;

    logger.info("[E2eeVM] Key exchange initialized");
  }, []);

  const destroyKeyExchange = useCallback(() => {
    callKeyExchangeRef.current?.destroy();
    callKeyExchangeRef.current = null;
    callMediaEncryptionRef.current?.destroy();
    callMediaEncryptionRef.current = null;
    rekeyMachineRef.current?.destroy();
    rekeyMachineRef.current = null;
    epochGuardRef.current?.markRoomLeft();
    epochGuardRef.current = null;
    producerPeerKeyRef.current.clear();
    peerUserIdByDeviceIdRef.current.clear();
    _missingSenderKeysRef.current.clear();
    keyPackageNonceRef.current.clear();
    keyPackageNonceTimestampsRef.current.clear();
    processedConsumerIdsRef.current.clear();
    for (const pending of pendingReceiverTransformsRef.current.values()) {
      if (pending.timeoutId !== null) window.clearTimeout(pending.timeoutId);
    }
    pendingReceiverTransformsRef.current.clear();
    pipeBreakRetryAtRef.current.clear();
    pipeBreakRecoveryInFlightRef.current.clear();
    handleE2eePipeBreakRef.current = null;
    logger.info("[E2eeVM] Key exchange destroyed");
  }, [_missingSenderKeysRef]);

  // ─── Inbound readiness ─────────────────────────────────────────
  const getInboundE2eeReadiness = useCallback((): InboundE2eeReadiness => {
    const mediaEncryption = callMediaEncryptionRef.current;
    const pendingConsumers = Array.from(pendingReceiverTransformsRef.current.keys());
    const requiredPeerIds = new Set<string>();

    for (const peerKey of producerPeerKeyRef.current.values()) {
      if (peerKey) requiredPeerIds.add(peerKey);
    }

    const missingDecryptionPeers = Array.from(requiredPeerIds).filter((peerId) =>
      !mediaEncryption?.hasDecryptionKeyForPeer(peerId)
    );

    return {
      ready: pendingConsumers.length === 0 && missingDecryptionPeers.length === 0,
      missingDecryptionPeers,
      pendingConsumers,
    };
  }, []);

  const hasInboundE2eeReadiness = useCallback((): boolean => {
    const readiness = getInboundE2eeReadiness();
    if (!readiness.ready) {
      logger.warn("[E2eeVM] E2EE_READY blocked: inbound not ready", readiness);
    }
    return readiness.ready;
  }, [getInboundE2eeReadiness]);

  // ─── Pending receiver transforms ─────────────────────────────────
  const tryAttachPendingReceiverTransform = useCallback((consumerId: string, reason: string): boolean => {
    const pending = pendingReceiverTransformsRef.current.get(consumerId);
    if (!pending) return true;

    const enc = callMediaEncryptionRef.current;
    const receiver = sfuManagerRef.current?.getConsumerReceiver(consumerId);

    if (enc && receiver && enc.hasDecryptionKeyForPeer(pending.peerKey)) {
      enc.setupReceiverTransform(receiver, pending.peerKey, consumerId);
      if (pending.timeoutId !== null) window.clearTimeout(pending.timeoutId);
      pendingReceiverTransformsRef.current.delete(consumerId);

      logger.info("[E2eeVM] Receiver transform attached", { consumerId, reason });

      if (pending.attempts > 0) {
        void callsWsRef.current?.consumerResume({ roomId: pending.roomId, consumerId }).catch((err) => {
          logger.error("[E2eeVM] deferred consumer resume failed", { consumerId, error: err });
          processedConsumerIdsRef.current.delete(consumerId);
          sfuManagerRef.current?.closeConsumer(consumerId);
        }).then(() => {
          if (callsWsRoomRef.current !== pending.roomId) return;
          rebuildRemoteStream();
        });
      }

      maybeSendE2eeReadyRef.current();
      return true;
    }

    pending.attempts += 1;
    if (Date.now() - pending.createdAt > PENDING_RECEIVER_TRANSFORM_TIMEOUT_MS) {
      if (pending.timeoutId !== null) window.clearTimeout(pending.timeoutId);
      pendingReceiverTransformsRef.current.delete(consumerId);
      logger.error("[E2eeVM] Receiver transform timeout — fail closed", { consumerId, reason });
      sfuManagerRef.current?.closeConsumer(consumerId);
      processedConsumerIdsRef.current.delete(consumerId);
      return false;
    }

    if (pending.timeoutId !== null) window.clearTimeout(pending.timeoutId);
    pending.timeoutId = window.setTimeout(() => {
      tryAttachPendingReceiverTransform(consumerId, "deferred-retry");
    }, 250);
    return false;
  }, [callsWsRef, callsWsRoomRef, sfuManagerRef, rebuildRemoteStream]);

  const queueReceiverTransform = useCallback((params: {
    consumerId: string;
    producerId: string;
    peerKey: string;
    roomId: string;
    reason: string;
  }): boolean => {
    const { consumerId, producerId, peerKey, roomId, reason } = params;
    const existing = pendingReceiverTransformsRef.current.get(consumerId);

    if (!existing) {
      const pending: PendingReceiverTransform = {
        consumerId, producerId, peerKey, roomId,
        createdAt: Date.now(), attempts: 0, timeoutId: null,
      };
      pending.timeoutId = window.setTimeout(() => {
        tryAttachPendingReceiverTransform(consumerId, "fail-closed-timeout");
      }, PENDING_RECEIVER_TRANSFORM_TIMEOUT_MS);
      pendingReceiverTransformsRef.current.set(consumerId, pending);
    } else {
      existing.producerId = producerId;
      existing.peerKey = peerKey;
      existing.roomId = roomId;
    }

    return tryAttachPendingReceiverTransform(consumerId, reason);
  }, [tryAttachPendingReceiverTransform]);

  const retryPendingReceiverTransformsForPeer = useCallback((peerKey: string) => {
    for (const pending of Array.from(pendingReceiverTransformsRef.current.values())) {
      if (pending.peerKey === peerKey) {
        tryAttachPendingReceiverTransform(pending.consumerId, "decryption-key-ready");
      }
    }
  }, [tryAttachPendingReceiverTransform]);

  const retryAllPendingReceiverTransforms = useCallback((reason: string) => {
    for (const consumerId of Array.from(pendingReceiverTransformsRef.current.keys())) {
      tryAttachPendingReceiverTransform(consumerId, reason);
    }
  }, [tryAttachPendingReceiverTransform]);

  // ─── E2EE_READY trigger ─────────────────────────────────────────
  const triggerE2eeReady = useCallback(() => {
    const client = callsWsRef.current;
    const roomId = callsWsRoomRef.current;
    const epoch = e2eeEpochRef.current;
    const readiness = canSendE2eeReady({
      epoch,
      mediaEncryption: callMediaEncryptionRef.current,
      rekeyMachine: rekeyMachineRef.current,
      missingSenderKeys: _missingSenderKeysRef.current,
      inbound: getInboundE2eeReadiness(),
      requireQuorum: false,
    });

    if (!readiness.ready) {
      logger.debug("[E2eeVM] E2EE_READY deferred", { readiness });
      return;
    }
    if (!client || !roomId) return;

    epochGuardRef.current?.markE2eeReady(epoch);
    void client.e2eeReady({ roomId, epoch }).catch((err) => {
      logger.warn("[E2eeVM] deferred E2EE_READY send failed", { error: err });
    });
  }, [callsWsRef, callsWsRoomRef, e2eeEpochRef, _missingSenderKeysRef, getInboundE2eeReadiness]);

  maybeSendE2eeReadyRef.current = triggerE2eeReady;

  // ─── Pipe break recovery ────────────────────────────────────────
  const setupPipeBreakRecovery = useCallback((
    onRecover: (info: PipeBreakInfo) => void,
  ) => {
    handleE2eePipeBreakRef.current = onRecover;
  }, []);

  // ─── Deferred key discovery (for late-joining peers) ────────────
  const requestDeferredKeyDiscovery = useCallback(async (roomId: string, epoch: number): Promise<void> => {
    const leaderDeviceId = e2eeLeaderDeviceRef.current;
    const myDeviceId = getStableCallsDeviceId();
    if (!leaderDeviceId || leaderDeviceId === myDeviceId) return;
    if (!user) return;

    const kx = callKeyExchangeRef.current;
    if (!kx) return;

    const senderPublicKey = await kx.getPublicKeyBase64();
    const sessionIdForDiscovery = kx.getSessionId();
    const discoveryMessageId = crypto.randomUUID();
    const discoverySaltB64 = bytesToBase64(crypto.getRandomValues(new Uint8Array(32)));
    const identityKeyPair = await getOrCreateIdentityKeyPair();
    const sigBytes = await signIdentity(
      identityKeyPair.privateKey,
      user.id,
      myDeviceId,
      sessionIdForDiscovery,
      senderPublicKey,
      senderPublicKey,
      epoch,
      discoverySaltB64,
      discoveryMessageId,
    );
    const identityPubKeyJwk = await exportEcdsaPublicKey(identityKeyPair.publicKey);
    const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sigBytes)));
    const mySigningPublicKey = await kx.getSigningPublicKeyBase64();

    await callsWsRef.current?.keyPackage({
      roomId,
      fromDeviceId: myDeviceId,
      toDeviceId: leaderDeviceId,
      targetDeviceId: leaderDeviceId,
      epoch,
      keyPackageType: "DISCOVERY",
      discoveryNonce: crypto.randomUUID(),
      messageId: discoveryMessageId,
      ciphertext: senderPublicKey,
      sig: sigB64,
      senderPublicKey,
      senderSigningPublicKey: mySigningPublicKey,
      salt: discoverySaltB64,
      senderIdentity: {
        userId: user.id,
        deviceId: myDeviceId,
        sessionId: sessionIdForDiscovery,
        identityPubKeyJwk,
      },
    });
  }, [e2eeLeaderDeviceRef, user, callsWsRef]);

  return {
    // Refs (for wiring to hooks)
    callKeyExchangeRef,
    callMediaEncryptionRef,
    rekeyMachineRef,
    epochGuardRef,
    keyPackageNonceRef,
    keyPackageNonceTimestampsRef,
    producerPeerKeyRef,
    peerUserIdByDeviceIdRef,
    missingSenderKeysRef: _missingSenderKeysRef,
    pendingReceiverTransformsRef,
    consumerCreateParamsRef,
    processedConsumerIdsRef,
    pipeBreakRetryAtRef,
    pipeBreakRecoveryInFlightRef,
    handleE2eePipeBreakRef,
    e2eeLeaderDeviceRef,
    // Lifecycle
    initKeyExchange,
    destroyKeyExchange,
    // Readiness
    getInboundE2eeReadiness,
    hasInboundE2eeReadiness,
    // Transform queue
    queueReceiverTransform,
    retryPendingReceiverTransformsForPeer,
    retryAllPendingReceiverTransforms,
    tryAttachPendingReceiverTransform,
    // E2EE_READY
    triggerE2eeReady,
    // Pipe break
    setupPipeBreakRecovery,
    // Key discovery
    requestDeferredKeyDiscovery,
    // State
    isE2eeActive,
    setIsE2eeActive,
  };
}
