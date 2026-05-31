import { useCallback, useEffect, type MutableRefObject } from "react";
import { logger } from "@/lib/logger";
import { getStableCallsDeviceId } from "@/lib/platform/device";
import {
  getOrCreateIdentityKeyPair,
  signIdentity,
  exportPublicKey as exportEcdsaPublicKey,
} from "@/calls-v2/ecdsaIdentity";
import type { CallKeyExchange } from "@/calls-v2/callKeyExchange";
import type { CallMediaEncryption } from "@/calls-v2/callMediaEncryption";
import type { CallsWsClient } from "@/calls-v2/wsClient";
import type { PipeBreakInfo } from "@/lib/e2ee/insertableStreams";
import { REQUIRE_SFRAME } from "./videoCallProvider.helpers";

const DECRYPTION_KEY_WAIT_TIMEOUT_MS = 15_000;
const DECRYPTION_KEY_WATCHDOG_INTERVAL_MS = 2_000;

interface PendingTransform {
  receiver: RTCRtpReceiver;
  peerKey: string;
  deferredAt: number;
  recoveryRequested: boolean;
}

interface Params {
  user: { id: string } | null;
  callsWsRef: MutableRefObject<CallsWsClient | null>;
  callsWsRoomRef: MutableRefObject<string | null>;
  e2eeEpochRef: MutableRefObject<number>;
  e2eeLeaderDeviceRef: MutableRefObject<string | null>;
  callKeyExchangeRef: MutableRefObject<CallKeyExchange | null>;
  callMediaEncryptionRef: MutableRefObject<CallMediaEncryption | null>;
  pendingReceiverTransformsRef: MutableRefObject<Map<string, PendingTransform>>;
  handleE2eePipeBreakRef: MutableRefObject<((info: PipeBreakInfo) => void) | null>;
}

export function useE2eeKeyWatchdog({
  user,
  callsWsRef,
  callsWsRoomRef,
  e2eeEpochRef,
  e2eeLeaderDeviceRef,
  callKeyExchangeRef,
  callMediaEncryptionRef,
  pendingReceiverTransformsRef,
  handleE2eePipeBreakRef,
}: Params) {
  const requestDeferredKeyDiscovery = useCallback(async (
    client: CallsWsClient,
    roomId: string,
    epoch: number,
  ): Promise<void> => {
    const leaderDeviceId = e2eeLeaderDeviceRef.current;
    const myDeviceId = getStableCallsDeviceId();
    if (!leaderDeviceId || leaderDeviceId === myDeviceId) return;

    const kx = callKeyExchangeRef.current;
    if (!kx || !user) return;

    const senderPublicKey = await kx.getPublicKeyBase64();
    const sessionIdForDiscovery = kx.getSessionId();
    const identityKeyPair = await getOrCreateIdentityKeyPair();
    const sigBytes = await signIdentity(
      identityKeyPair.privateKey,
      user.id,
      myDeviceId,
      sessionIdForDiscovery,
      senderPublicKey,
      senderPublicKey,
      epoch,
      "",
    );
    const identityPubKeyJwk = await exportEcdsaPublicKey(identityKeyPair.publicKey);
    const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sigBytes)));
    const mySigningPublicKey = await kx.getSigningPublicKeyBase64();

    await client.keyPackage({
      roomId,
      fromDeviceId: myDeviceId,
      toDeviceId: leaderDeviceId,
      targetDeviceId: leaderDeviceId,
      epoch,
      keyPackageType: "DISCOVERY",
      discoveryNonce: crypto.randomUUID(),
      ciphertext: senderPublicKey,
      sig: sigB64,
      senderPublicKey,
      senderSigningPublicKey: mySigningPublicKey,
      salt: "",
      senderIdentity: {
        userId: user.id,
        deviceId: myDeviceId,
        sessionId: sessionIdForDiscovery,
        identityPubKeyJwk,
      },
    });
  }, [user, e2eeLeaderDeviceRef, callKeyExchangeRef]);

  // Re-apply receiver transforms when a decryption key arrives for a pending track
  const onDecryptionKeyReady = useCallback((peerKey: string) => {
    const enc = callMediaEncryptionRef.current;
    if (!enc) return;
    for (const [trackId, pending] of pendingReceiverTransformsRef.current) {
      if (pending.peerKey !== peerKey) continue;
      if (!enc.hasDecryptionKeyForPeer(pending.peerKey)) continue;
      try {
        enc.setupReceiverTransform(pending.receiver, pending.peerKey, trackId);
        pendingReceiverTransformsRef.current.delete(trackId);
        logger.info("[useE2eeKeyWatchdog] receiver transform re-applied after key arrival", { trackId, peerKey });
      } catch (e) {
        logger.error("[useE2eeKeyWatchdog] receiver transform re-apply failed", {
          trackId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }, [callMediaEncryptionRef, pendingReceiverTransformsRef]);

  useEffect(() => {
    if (!REQUIRE_SFRAME) return;

    const timer = window.setInterval(() => {
      const pending = pendingReceiverTransformsRef.current;
      if (pending.size === 0) return;

      const now = Date.now();
      for (const [trackId, item] of pending) {
        if (item.recoveryRequested) continue;
        if (now - item.deferredAt < DECRYPTION_KEY_WAIT_TIMEOUT_MS) continue;

        item.recoveryRequested = true;
        pending.set(trackId, item);

        logger.warn("useE2eeKeyWatchdog.key_missing_timeout", {
          trackId,
          peerKey: item.peerKey,
          waitedMs: now - item.deferredAt,
        });

        const ws = callsWsRef.current;
        const roomId = callsWsRoomRef.current;
        const epoch = e2eeEpochRef.current;
        if (ws && roomId && ws.connectionState === "connected" && Number.isFinite(epoch) && epoch >= 0) {
          void requestDeferredKeyDiscovery(ws, roomId, epoch).catch((error) => {
            logger.warn("[useE2eeKeyWatchdog] deferred key discovery failed", {
              trackId,
              peerKey: item.peerKey,
              error: error instanceof Error ? error.message : String(error),
            });
          });
        }

        pending.delete(trackId);
        handleE2eePipeBreakRef.current?.({ trackId, direction: "decrypt", peerId: item.peerKey });
      }
    }, DECRYPTION_KEY_WATCHDOG_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [
    callsWsRef,
    callsWsRoomRef,
    e2eeEpochRef,
    pendingReceiverTransformsRef,
    requestDeferredKeyDiscovery,
    handleE2eePipeBreakRef,
  ]);

  return { requestDeferredKeyDiscovery, onDecryptionKeyReady };
}
