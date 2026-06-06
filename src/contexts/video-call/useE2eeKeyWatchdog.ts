import { useCallback, type MutableRefObject } from "react";
import { logger } from "@/lib/logger";
import { getStableCallsDeviceId } from "@/lib/platform/device";
import {
  getOrCreateIdentityKeyPair,
  signIdentity,
  exportPublicKey as exportEcdsaPublicKey,
} from "@/calls-v2/ecdsaIdentity";
import type { CallKeyExchange } from "@/calls-v2/callKeyExchange";
import type { CallsWsClient } from "@/calls-v2/wsClient";
import type { PipeBreakInfo } from "@/lib/e2ee/insertableStreams";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    if (byte === undefined) continue;
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

interface Params {
  user: { id: string } | null;
  callsWsRef: MutableRefObject<CallsWsClient | null>;
  callsWsRoomRef: MutableRefObject<string | null>;
  e2eeEpochRef: MutableRefObject<number>;
  e2eeLeaderDeviceRef: MutableRefObject<string | null>;
  callKeyExchangeRef: MutableRefObject<CallKeyExchange | null>;
  handleE2eePipeBreakRef: MutableRefObject<((info: PipeBreakInfo) => void) | null>;
}

export function useE2eeKeyWatchdog({
  user,
  e2eeLeaderDeviceRef,
  callKeyExchangeRef,
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

    await client.keyPackage({
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
  }, [user, e2eeLeaderDeviceRef, callKeyExchangeRef]);

  const onDecryptionKeyReady = useCallback((_peerKey: string) => {
    // Transforms are attached immediately on consumer creation (fail-closed).
    // MediaEncryptor drops frames until the key arrives — no deferred retry needed.
    logger.debug("[useE2eeKeyWatchdog] onDecryptionKeyReady: no-op (fail-closed transforms)");
  }, []);

  return { requestDeferredKeyDiscovery, onDecryptionKeyReady };
}
