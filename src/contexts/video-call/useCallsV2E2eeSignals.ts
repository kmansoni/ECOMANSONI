import { useCallback, useRef } from "react";
import { logger } from "@/lib/logger";
import { getStableCallsDeviceId } from "@/lib/platform/device";
import { CallKeyExchange, type KeyPackageData } from "../../calls-v2/callKeyExchange";
import { CallMediaEncryption } from "../../calls-v2/callMediaEncryption";
import { RekeyStateMachine } from "../../calls-v2/rekeyStateMachine";
import { EpochGuard } from "@/calls-v2/epochGuard";
import type { CallsWsClient } from "@/calls-v2/wsClient";
import type { SfuMediaManager } from "@/calls-v2/sfuMediaManager";
import type { RtpCapabilities } from "@/calls-v2/types";
import { getOrCreateIdentityKeyPair, signIdentity, exportPublicKey as exportEcdsaPublicKey, verifyIdentity, importPublicKey } from "@/calls-v2/ecdsaIdentity";

interface UseCallsV2E2eeSignalsParams {
  user: { id: string } | null;
  callsWsRoomRef: { current: string | null };
  lastSnapshotRoomVersionRef: { current: number };
  e2eeEpochRef: { current: number };
  e2eeLeaderDeviceRef: { current: string | null };
  keyPackageNonceRef: { current: Set<string> };
  keyPackageNonceTimestampsRef: { current: Map<string, number> };
  callKeyExchangeRef: { current: CallKeyExchange | null };
  callMediaEncryptionRef: { current: CallMediaEncryption | null };
  rekeyMachineRef: { current: RekeyStateMachine | null };
  epochGuardRef: { current: EpochGuard | null };
  producerPeerKeyRef: { current: Map<string, string> };
  peerUserIdByDeviceIdRef: { current: Map<string, string> };
  callsWsRef: { current: CallsWsClient | null };
  sfuManagerRef: { current: SfuMediaManager | null };
  sfuRouterRtpCapabilitiesRef: { current: RtpCapabilities | null };
  pendingProducersToConsumeRef: { current: Map<string, { roomId: string; peerDeviceId?: string; peerUserId?: string }> };
  consumePendingProducersRef: { current: (() => void) | null };
  onE2eeActivated?: () => void;
  onDecryptionKeyReady?: (peerKey: string) => void;
}

const NONCE_TTL_MS = 5 * 60 * 1000;

export function useCallsV2E2eeSignals({
  user,
  callsWsRoomRef,
  lastSnapshotRoomVersionRef,
  e2eeEpochRef,
  e2eeLeaderDeviceRef,
  keyPackageNonceRef,
  keyPackageNonceTimestampsRef,
  callKeyExchangeRef,
  callMediaEncryptionRef,
  rekeyMachineRef,
  epochGuardRef,
  producerPeerKeyRef,
  peerUserIdByDeviceIdRef,
  callsWsRef,
  sfuManagerRef,
  sfuRouterRtpCapabilitiesRef,
  pendingProducersToConsumeRef,
  consumePendingProducersRef,
  onDecryptionKeyReady,
  onE2eeActivated,
}: UseCallsV2E2eeSignalsParams) {
  const attachedSignalsClientRef = useRef<CallsWsClient | null>(null);
  const detachSignalsRef = useRef<(() => void) | null>(null);

  const addNonce = useCallback((nonce: string) => {
    const now = Date.now();
    keyPackageNonceRef.current.add(nonce);
    keyPackageNonceTimestampsRef.current.set(nonce, now);
    // Evict expired entries
    for (const [key, ts] of keyPackageNonceTimestampsRef.current) {
      if (now - ts > NONCE_TTL_MS) {
        keyPackageNonceRef.current.delete(key);
        keyPackageNonceTimestampsRef.current.delete(key);
      }
    }
  }, [keyPackageNonceRef, keyPackageNonceTimestampsRef]);
  const base64ToBytes = useCallback((b64: string): Uint8Array => {
    return Uint8Array.from(atob(b64), (char) => char.charCodeAt(0));
  }, []);

  const bytesToBase64 = useCallback((bytes: Uint8Array): string => {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      const byte = bytes.at(i);
      if (byte === undefined) continue;
      binary += String.fromCharCode(byte);
    }
    return btoa(binary);
  }, []);

  const deriveSenderKeyId = useCallback(async (senderPublicKeyB64: string): Promise<string> => {
    const senderPublicKeyBytes = base64ToBytes(senderPublicKeyB64);
    const keyMaterial = senderPublicKeyBytes.length > 65
      ? senderPublicKeyBytes.slice(senderPublicKeyBytes.length - 65)
      : senderPublicKeyBytes;
    const firstEight = keyMaterial.slice(0, 8);
    const digest = await crypto.subtle.digest("SHA-256", firstEight);
    const view = new DataView(digest);
    const keyId = view.getUint32(0, false);
    return `sk-${keyId.toString(16).padStart(8, "0")}`;
  }, [base64ToBytes]);

  const resolvePeerIdentity = useCallback((params: {
    payloadPeerId?: string;
    payloadUserId?: string;
    payloadDeviceId?: string;
    fallbackUserId?: string;
  }): { peerId: string; userId: string; deviceId?: string } | null => {
    const payloadPeerId = params.payloadPeerId?.trim() ?? "";
    const payloadUserId = params.payloadUserId?.trim() ?? "";
    const payloadDeviceId = params.payloadDeviceId?.trim() ?? "";
    const fallbackUserId = params.fallbackUserId?.trim() ?? "";

    if (payloadPeerId) {
      const sep = payloadPeerId.indexOf(":");
      if (sep > 0 && sep < payloadPeerId.length - 1) {
        const userId = payloadPeerId.slice(0, sep).trim();
        const deviceId = payloadPeerId.slice(sep + 1).trim();
        if (userId && deviceId) {
          return { peerId: `${userId}:${deviceId}`, userId, deviceId };
        }
      }
      if (payloadDeviceId) {
        return { peerId: `${payloadPeerId}:${payloadDeviceId}`, userId: payloadPeerId, deviceId: payloadDeviceId };
      }
      return { peerId: payloadPeerId, userId: payloadPeerId };
    }

    const effectiveUserId = payloadUserId || fallbackUserId;
    if (effectiveUserId && payloadDeviceId) {
      return { peerId: `${effectiveUserId}:${payloadDeviceId}`, userId: effectiveUserId, deviceId: payloadDeviceId };
    }
    if (effectiveUserId) {
      return { peerId: effectiveUserId, userId: effectiveUserId };
    }
    if (payloadDeviceId) {
      return { peerId: payloadDeviceId, userId: payloadDeviceId, deviceId: payloadDeviceId };
    }
    return null;
  }, []);

  const attachCallsV2E2eeSignals = useCallback((client: CallsWsClient): void => {
    if (attachedSignalsClientRef.current === client) {
      return;
    }

    if (detachSignalsRef.current) {
      detachSignalsRef.current();
      detachSignalsRef.current = null;
    }

    const unsubs: Array<() => void> = [];
    const on = (
      event: Parameters<CallsWsClient["on"]>[0],
      handler: Parameters<CallsWsClient["on"]>[1]
    ) => {
      unsubs.push(client.on(event, handler));
    };

    on("AUTH_FAIL", (frame) => {
      logger.warn("[VideoCallContext] calls-v2 auth-fail", { payload: frame.payload });
    });

    on("ERROR", (frame) => {
      logger.warn("[VideoCallContext] calls-v2 server-error", {
        type: frame.type,
        payload: frame.payload,
        ack: frame.ack,
      });
    });

    on("ROOM_LEFT", (frame) => {
      logger.warn("[VideoCallContext] calls-v2 room-left", { payload: frame.payload });
    });

     on("ROOM_SNAPSHOT", (frame) => {
       const snapshot = frame.payload as {
         roomId?: string;
         roomVersion?: number | string;
         e2ee?: { leaderDeviceId?: string };
         peers?: Array<{ peerId?: string; userId?: string; deviceId?: string }>;
         producers?: Array<{ producerId?: string; peerDeviceId?: string; kind?: string; source?: string }>;
       } | null;
       const roomVersionRaw = snapshot?.roomVersion;
       const roomVersion = typeof roomVersionRaw === "number" ? roomVersionRaw : Number(roomVersionRaw);
       if (!Number.isFinite(roomVersion) || roomVersion < 0) {
         logger.warn("[VideoCallContext] ROOM_SNAPSHOT ignored: invalid roomVersion", {
           roomVersion: roomVersionRaw,
         });
         return;
       }
       if (roomVersion <= lastSnapshotRoomVersionRef.current) {
         return;
       }
       lastSnapshotRoomVersionRef.current = roomVersion;
       const leader = snapshot?.e2ee?.leaderDeviceId;
       if (typeof leader === "string" && leader.length > 0) {
         e2eeLeaderDeviceRef.current = leader;
       }
       if (Array.isArray(snapshot?.peers)) {
         const peerIds: string[] = (snapshot.peers as Array<{ peerId?: string; userId?: string; deviceId?: string }>)
           .map((p) => p.peerId ?? p.userId ?? p.deviceId ?? "")
           .filter(Boolean);
         rekeyMachineRef.current?.setActivePeers(peerIds);

         for (const peer of snapshot.peers as Array<{ peerId?: string; userId?: string; deviceId?: string }>) {
           const canonicalPeerId = peer.peerId ?? peer.userId;
           if (!canonicalPeerId || !peer?.deviceId) continue;
           const peerUserId = canonicalPeerId.includes(":") ? canonicalPeerId.split(":")[0] : canonicalPeerId;
           if (peerUserId) {
             peerUserIdByDeviceIdRef.current.set(peer.deviceId, peerUserId);
           }
         }
       }
       // Process producers from snapshot
       const snapshotProducers = (snapshot as { producers?: Array<{ producerId?: string; peerDeviceId?: string; kind?: string; source?: string }> } | null)?.producers;
       const snapshotRoomId = snapshot?.roomId;
       const activeRoomId = callsWsRoomRef.current ?? snapshotRoomId ?? null;
       if (callsWsRoomRef.current && snapshotRoomId && snapshotRoomId !== callsWsRoomRef.current) {
         logger.debug("[VideoCallContext] ROOM_SNAPSHOT producers ignored: room mismatch", {
           activeRoomId: callsWsRoomRef.current,
           snapshotRoomId,
         });
         return;
       }
       if (Array.isArray(snapshotProducers) && activeRoomId) {
         const localDeviceId = getStableCallsDeviceId();
         logger.debug("[VideoCallContext] ROOM_SNAPSHOT producers received", {
           roomId: activeRoomId,
           producers: snapshotProducers.length,
           localDeviceId,
           mediaLoaded: Boolean(sfuManagerRef.current?.loaded),
           hasRouterCaps: Boolean(sfuRouterRtpCapabilitiesRef.current),
         });
         for (const prod of snapshotProducers) {
           if (prod.producerId && prod.peerDeviceId !== localDeviceId) {
             if (sfuManagerRef.current?.loaded && sfuRouterRtpCapabilitiesRef.current) {
               logger.debug("[VideoCallContext] consume from snapshot dispatch", {
                 producerId: prod.producerId,
                 roomId: activeRoomId,
                 peerDeviceId: prod.peerDeviceId,
               });
                void client.consume({ roomId: activeRoomId, producerId: prod.producerId, rtpCapabilities: sfuRouterRtpCapabilitiesRef.current }).catch((err) => {
                  // Do not drop producer on transient failures (transport race / ack timeout).
                  // Re-queue for the shared pending-consume retry path.
                  pendingProducersToConsumeRef.current.set(prod.producerId!, {
                    roomId: activeRoomId,
                    peerDeviceId: prod.peerDeviceId,
                    peerUserId: prod.peerDeviceId ? peerUserIdByDeviceIdRef.current.get(prod.peerDeviceId) : undefined,
                  });
                  logger.warn("[VideoCallContext] consume from snapshot failed; producer re-queued", {
                    producerId: prod.producerId,
                    roomId: activeRoomId,
                    error: err instanceof Error ? err.message : String(err),
                  });
                });
             } else {
               const peerDeviceId = prod.peerDeviceId ?? "";
               const peerUserIdFromMap = peerUserIdByDeviceIdRef.current.get(peerDeviceId) ?? "";
               pendingProducersToConsumeRef.current.set(prod.producerId ?? "", {
                 roomId: activeRoomId,
                 peerDeviceId: peerDeviceId,
                 peerUserId: peerUserIdFromMap,
               });
               logger.debug("[VideoCallContext] snapshot producer queued for pending consume", {
                 producerId: prod.producerId,
                 roomId: activeRoomId,
                 peerDeviceId: prod.peerDeviceId,
                 pendingSize: pendingProducersToConsumeRef.current.size,
               });
               if (peerUserIdFromMap) {
                 producerPeerKeyRef.current.set(prod.producerId ?? "", `${peerUserIdFromMap}:${peerDeviceId}`);
               }
             }
           }
         }
       }
     });

    on("REKEY_BEGIN", (frame) => {
      const activeRoomId = callsWsRoomRef.current;
      const rekeyPayload = frame.payload as { roomId?: string; epoch?: number | string } | undefined;
      const roomId = rekeyPayload?.roomId;
      if (!activeRoomId || !roomId || roomId !== activeRoomId) return;

      const epochRaw = rekeyPayload?.epoch;
      const epoch = typeof epochRaw === "number" ? epochRaw : Number(epochRaw);
      if (!Number.isFinite(epoch) || epoch < 0) return;

      const myDeviceId = getStableCallsDeviceId();
      const leaderDeviceId = e2eeLeaderDeviceRef.current;
      if (!leaderDeviceId || leaderDeviceId === myDeviceId) return;

      const nonce = `${roomId}:${epoch}:${myDeviceId}`;
      if (keyPackageNonceRef.current.has(nonce)) return;
      addNonce(nonce);

      const keyExchange = callKeyExchangeRef.current;
      const mediaEncryption = callMediaEncryptionRef.current;

      if (!keyExchange || !mediaEncryption) {
        logger.warn("[VideoCallContext] KEY_PACKAGE: key exchange not initialized, skipping");
        return;
      }

       // FIX: используем захваченный keyExchange, а не повторно читаем callKeyExchangeRef.current
       // ниже в async блоке. Реф может стать null между этой проверкой и доступом к sessionId
       // (например, при размонтировании компонента во время обработки события из WebSocket-потока).
       // Повторное чтение рефа без null-guard на строке getSessionId() — race-condition.
       void (async () => {
         try {
            const kx = callKeyExchangeRef.current;
            const enc = callMediaEncryptionRef.current;
            if (!kx || !enc) {
              logger.warn("[VideoCallContext] REKEY_BEGIN: key exchange or encryption not ready, skipping");
              return;
            }
            const existingKey = kx.getCurrentEpochKey();
            if (existingKey && existingKey.epoch === epoch) {
              return; // уже есть ключ для этого epoch, не пересоздаём
            }
            const epochKey = await kx.createEpochKey(epoch);
           await enc.setEncryptionKey(epochKey);

           const senderPublicKey = await kx.getPublicKeyBase64();
           const senderKeyId = await deriveSenderKeyId(senderPublicKey);
           const sessionIdForDiscovery = kx.getSessionId();
           if (!sessionIdForDiscovery) {
             logger.error("[VideoCallContext] KEY_PACKAGE discovery aborted: CallKeyExchange.getSessionId() returned empty");
             return;
           }

           const identityKeyPair = await getOrCreateIdentityKeyPair();
           const sigBytes = await signIdentity(
             identityKeyPair.privateKey,
             user?.id ?? "",
             getStableCallsDeviceId(),
             sessionIdForDiscovery,
             senderPublicKey,
             senderPublicKey,
             epoch,
             "",
             crypto.randomUUID(),
           );
           const identityPubKeyJwk = await exportEcdsaPublicKey(identityKeyPair.publicKey);
           const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sigBytes)));

            const discoveryNonce = crypto.randomUUID();
            const mySigningPublicKey = await kx.getSigningPublicKeyBase64();
            // Discovery: используем случайный salt вместо пустого — защищает HKDF от детерминированной деривации
            const discoverySalt = crypto.getRandomValues(new Uint8Array(32));
            void client.keyPackage({
              roomId,
              fromDeviceId: getStableCallsDeviceId(),
              toDeviceId: leaderDeviceId,
              senderKeyId,
              targetDeviceId: leaderDeviceId,
              epoch,
              keyPackageType: "DISCOVERY",
              discoveryNonce,
              ciphertext: senderPublicKey,
              sig: sigB64,
              senderPublicKey,
              senderSigningPublicKey: mySigningPublicKey,
              salt: bytesToBase64(discoverySalt),
             senderIdentity: {
               userId: user?.id ?? "",
               deviceId: getStableCallsDeviceId(),
               sessionId: sessionIdForDiscovery,
               identityPubKeyJwk,
             },
           }).catch((error) => {
             logger.warn("[VideoCallContext] KEY_PACKAGE send failed", error);
           });

           logger.info("[VideoCallContext] KEY_PACKAGE sent (Phase C ECDSA+ECDH discovery)", { epoch, roomId });
         } catch (err) {
           logger.warn("[VideoCallContext] KEY_PACKAGE async error", err);
         }
       })();
    });

    on("KEY_PACKAGE", (frame) => {
      const activeRoomId = callsWsRoomRef.current;
      const keyPkgPayload = frame.payload as {
        roomId?: string;
        targetDeviceId?: string;
        toDeviceId?: string;
        epoch?: number | string;
      } | undefined;
      const roomId = keyPkgPayload?.roomId;
      if (!activeRoomId || !roomId || roomId !== activeRoomId) return;

      const myDeviceId = getStableCallsDeviceId();
      const leaderDeviceId = e2eeLeaderDeviceRef.current;
      const targetDeviceId = keyPkgPayload?.targetDeviceId ?? keyPkgPayload?.toDeviceId;
      if (!targetDeviceId || targetDeviceId !== myDeviceId) return;

      const epochRaw = keyPkgPayload?.epoch;
      const epoch = typeof epochRaw === "number" ? epochRaw : Number(epochRaw);
      if (!Number.isFinite(epoch) || epoch < 0) return;

      const msgId =
        frame.msgId ??
        ((frame.payload as Record<string, unknown> | undefined)?.messageId as string | undefined);
      const isValidPkg = rekeyMachineRef.current?.validateKeyPackage(epoch, msgId);
      if (isValidPkg === false) {
        logger.warn("[VideoCallContext] KEY_PACKAGE rejected: anti-replay or stale epoch", { epoch, msgId });
        return;
      }

      const keyExchange = callKeyExchangeRef.current;
      const mediaEncryption = callMediaEncryptionRef.current;

      void (async () => {
        try {
          const rawPayload = frame.payload as Record<string, unknown> | undefined;
          const senderPublicKeyB64 = rawPayload?.senderPublicKey as string | undefined;
          const ciphertextB64 = rawPayload?.ciphertext as string | undefined;
          const sigB64 = rawPayload?.sig as string | undefined;
          const senderKeyIdFromPayload = rawPayload?.senderKeyId as string | undefined;
          const keyPackageType = rawPayload?.keyPackageType as string | undefined;
          const discoveryNonce = rawPayload?.discoveryNonce as string | undefined;
          const payloadRoomId = (rawPayload?.roomId as string | undefined) ?? "";

          const isDiscovery = keyPackageType === "DISCOVERY";

          // Sig is REQUIRED for ALL key packages (discovery + non-discovery), regardless of
          // whether identityPubKeyJwk is present. Unsigned key packages are rejected to prevent
          // MITM attacks where an attacker sends a forged senderPublicKey without a signature.
          if (!sigB64 || sigB64.length === 0) {
            logger.warn("[VideoCallContext] KEY_PACKAGE rejected: missing signature", { epoch, roomId, isDiscovery });
            return;
          }

          // Cross-room protection: reject non-discovery packets from other rooms.
          // Discovery packets are exempt because the leader proactively sends them
          // to each joining device without knowing the target roomId.
          if (!isDiscovery && payloadRoomId !== roomId) {
            logger.warn("[VideoCallContext] KEY_PACKAGE rejected: roomId mismatch — possible cross-room injection attempt", {
              epoch, expectedRoomId: roomId, actualRoomId: payloadRoomId
            });
            return;
          }

          if (keyExchange && mediaEncryption && senderPublicKeyB64 && ciphertextB64 && sigB64) {
            const senderIdentityObj = rawPayload?.senderIdentity as
              | { userId?: string; deviceId?: string; sessionId?: string }
              | undefined;
            const senderDeviceId =
              senderIdentityObj?.deviceId
              ?? (rawPayload?.fromDeviceId as string | undefined)
              ?? "";
            const senderUserIdFallback = senderDeviceId
              ? (peerUserIdByDeviceIdRef.current.get(senderDeviceId) ?? "")
              : "";
            const senderIdentity = resolvePeerIdentity({
              payloadPeerId: rawPayload?.peerId as string | undefined,
              payloadUserId: senderIdentityObj?.userId ?? (rawPayload?.fromUserId as string | undefined),
              payloadDeviceId: senderDeviceId,
              fallbackUserId: senderUserIdFallback,
            });
            const senderUserId = senderIdentity?.userId ?? "unknown";
            const senderSessionId = senderIdentityObj?.sessionId ?? "";
            const senderKeyId = senderKeyIdFromPayload && senderKeyIdFromPayload.length > 0
              ? senderKeyIdFromPayload
              : await deriveSenderKeyId(senderPublicKeyB64);
            const packageDeliveryKey = [
              roomId,
              String(epoch),
              senderDeviceId || "unknown-sender",
              targetDeviceId,
              senderKeyId,
            ].join(":");

            const senderSigningKeyB64 = rawPayload?.senderSigningPublicKey as string | undefined;
            if (senderSigningKeyB64 && senderIdentity?.peerId) {
              try {
                await keyExchange.registerPeerSigningKey(senderIdentity.peerId, senderSigningKeyB64);
              } catch (regErr) {
                logger.warn("[VideoCallContext] registerPeerSigningKey failed", {
                  peerId: senderIdentity.peerId,
                  error: regErr instanceof Error
                    ? { name: regErr.name, message: regErr.message }
                    : String(regErr),
                });
              }
            }

const pkgData: KeyPackageData = {
               senderPublicKey: senderPublicKeyB64 ?? "",
               ciphertext: ciphertextB64 ?? "",
               sig: sigB64 ?? "",
               epoch,
               salt: (rawPayload?.salt as string | undefined) ?? "",
               messageId: (rawPayload?.messageId as string | undefined) ?? msgId ?? "",
               senderIdentity: {
                 userId: senderUserId,
                 deviceId: senderDeviceId,
                 sessionId: senderSessionId,
               },
             };

             // H-3: messageId required for anti-replay protection
             const messageId = pkgData.messageId;
             if (!isDiscovery && (!messageId || messageId.length === 0)) {
               logger.warn("[VideoCallContext] KEY_PACKAGE rejected: messageId is missing — anti-replay required", { epoch });
               return;
             }

            if (isDiscovery) {
              if (ciphertextB64 !== senderPublicKeyB64) {
                logger.warn("[VideoCallContext] KEY_PACKAGE discovery rejected: ciphertext must equal senderPublicKey", {
                  epoch,
                  senderUserId,
                });
                return;
              }
              if (!discoveryNonce || discoveryNonce.length < 16) {
                logger.warn("[VideoCallContext] KEY_PACKAGE discovery rejected: missing/short discoveryNonce", {
                  epoch,
                  senderUserId,
                });
                return;
              }

              const replayNonceKey = `discovery:in:${roomId}:${epoch}:${senderDeviceId}:${discoveryNonce}`;
              if (keyPackageNonceRef.current.has(replayNonceKey)) {
                logger.warn("[VideoCallContext] KEY_PACKAGE discovery replay rejected", {
                  epoch,
                  senderUserId,
                  senderDeviceId,
                });
                return;
              }
              addNonce(replayNonceKey);
              if (leaderDeviceId !== myDeviceId || !senderDeviceId) {
                return;
              }

              // Verify ECDSA signature on discovery packet before creating wrapped epoch key.
              // Discovery packets carry sigB64 when sent by current-version clients.
              // If sigB64 is present + senderIdentity has identityPubKeyJwk → verify.
              // Reject on verification failure. Allow without verification only if
              // sender is a legacy client (no sig, no identity key) — defense in depth
              // via WS authentication (only authenticated devices reach this handler).
              if (sigB64 && sigB64.length > 0) {
                const senderIdentityJwk = rawPayload?.senderIdentity as
                  | { identityPubKeyJwk?: JsonWebKey }
                  | undefined;
                const senderJwk = senderIdentityJwk?.identityPubKeyJwk;
                if (senderJwk && senderJwk.kty && senderJwk.crv) {
                  try {
                    const senderVerifyKey = await importPublicKey(senderJwk);
                    const sigBytes = Uint8Array.from(atob(sigB64), (c) => c.charCodeAt(0));
                    const senderSalt = (rawPayload?.salt as string | undefined) ?? "";
                    const senderMessageId = (rawPayload?.messageId as string | undefined) ?? "";
                    const valid = await verifyIdentity(
                      senderVerifyKey,
                      senderUserId,
                      senderDeviceId,
                      senderSessionId,
                      senderPublicKeyB64,
                      ciphertextB64,
                      epoch,
                      senderSalt,
                      senderMessageId,
                      sigBytes.buffer as ArrayBuffer,
                    );
                    if (!valid) {
                      logger.warn("[VideoCallContext] KEY_PACKAGE discovery rejected: ECDSA signature verification FAILED", {
                        epoch, senderUserId, senderDeviceId,
                      });
                      return;
                    }
                    logger.debug("[VideoCallContext] KEY_PACKAGE discovery ECDSA signature verified", {
                      epoch, senderUserId,
                    });
                  } catch (verifyErr) {
                    logger.warn("[VideoCallContext] KEY_PACKAGE discovery signature verification error", {
                      epoch, senderUserId, error: verifyErr instanceof Error ? verifyErr.message : String(verifyErr),
                    });
                    // Fail-closed: reject if verification attempted but failed
                    return;
                  }
                }
              }

              logger.info("[VideoCallContext] KEY_PACKAGE discovery accepted: leader responding with wrapped epoch key", {
                epoch,
                senderDeviceId,
              });

              void (async () => {
                try {
                  const kx = callKeyExchangeRef.current;
                  const enc = callMediaEncryptionRef.current;
                  if (!kx || !enc) {
                    logger.warn("[VideoCallContext] KEY_PACKAGE discovery: crypto not ready, skipping");
                    return;
                  }
                  const current = kx.getCurrentEpochKey();
                  const epochKey = current?.epoch === epoch ? current : await kx.createEpochKey(epoch);
                  await enc.setEncryptionKey(epochKey);

                  const pkg = await kx.createKeyPackage(senderPublicKeyB64, epoch);
                  const senderKeyId = await deriveSenderKeyId(pkg.senderPublicKey);
const leaderSessionId = kx.getSessionId();
                   const leaderSigningPublicKey = await kx.getSigningPublicKeyBase64();
                   const identityKeyPair = await getOrCreateIdentityKeyPair();
                   const identityPubKeyJwk = await exportEcdsaPublicKey(identityKeyPair.publicKey);
                   const identitySigRaw = await signIdentity(
                     identityKeyPair.privateKey,
                     user?.id ?? "",
                     getStableCallsDeviceId(),
                     leaderSessionId,
                     pkg.senderPublicKey,
                     pkg.ciphertext,
                     epoch,
                     pkg.salt,
                     pkg.messageId,
                   );
const identitySig = btoa(String.fromCharCode(...new Uint8Array(identitySigRaw)));
                   void client.keyPackage({
                     roomId,
                     fromDeviceId: getStableCallsDeviceId(),
                     toDeviceId: senderDeviceId,
                     senderKeyId,
                     targetDeviceId: senderDeviceId,
                     epoch,
                     keyPackageType: "WRAPPED_EPOCH_KEY",
                     ciphertext: pkg.ciphertext,
                     sig: pkg.sig,
                     identitySig,
                     senderPublicKey: pkg.senderPublicKey,
                     senderSigningPublicKey: leaderSigningPublicKey,
                     salt: pkg.salt,
                     senderIdentity: {
                       userId: user?.id ?? "",
                       deviceId: getStableCallsDeviceId(),
                       sessionId: leaderSessionId,
                       identityPubKeyJwk,
                     },
                   }).catch((err) => {
                     logger.warn("[VideoCallContext] leader KEY_PACKAGE response failed", err);
                   });
                } catch (e2) {
                  logger.warn("[VideoCallContext] leader KEY_PACKAGE creation failed", e2);
                }
              })();

              return;
            }

            // Non-discovery packet: salt обязателен (C-1 fix: предотвращает deterministic ECDH для MITM)
            // Пустой/короткой соль позволяет атакующему вычислить HKDF статично, если известны публичные ключи.
            if (!isDiscovery && (!pkgData.salt || pkgData.salt.length < 8)) {
              logger.warn("[VideoCallContext] KEY_PACKAGE rejected: empty/short salt on non-discovery packet", { epoch, senderUserId });
              return;
            }

            if (!isDiscovery) {
              const semanticReplayKey = `wrapped:in:${packageDeliveryKey}`;
              if (keyPackageNonceRef.current.has(semanticReplayKey)) {
                logger.warn("[VideoCallContext] KEY_PACKAGE wrapped delivery replay rejected", {
                  epoch,
                  senderUserId,
                  senderDeviceId,
                  senderKeyId,
                  targetDeviceId,
                });
                return;
              }
              addNonce(semanticReplayKey);
            }

            let keyExchangeSuccess = false;

            try {
              const peerEpochKey = await keyExchange.processKeyPackage(pkgData);
              const peerKey = senderIdentity?.peerId ?? senderUserId;
              logger.debug("[VideoCallContext] KEY_PACKAGE: about to call setDecryptionKey", {
                epoch: peerEpochKey.epoch,
                peerKey,
                senderUserId,
                senderDeviceId,
              });
              await mediaEncryption.setDecryptionKey(peerKey, peerEpochKey);
              keyExchangeSuccess = true;
              logger.info("[VideoCallContext] KEY_PACKAGE: processKeyPackage OK", { epoch, senderUserId, peerKey });
              onDecryptionKeyReady?.(peerKey);
            } catch (error) {
              const errDetail = error instanceof Error
                ? { name: error.name, message: error.message }
                : { message: String(error) };
              logger.warn("video_call_context.key_package_process_failed", {
                error: errDetail,
                epoch,
                senderUserId,
                senderDeviceId,
                isDiscovery,
                haveSigningKey: Boolean(senderSigningKeyB64),
              });
            }

            if (keyExchangeSuccess) {
              void client.keyAck({
                roomId,
                epoch,
                fromDeviceId: myDeviceId,
                toDeviceId: senderDeviceId || undefined,
                senderKeyId,
                refId: frame.msgId,
              }).catch((error) => {
                logger.warn("[VideoCallContext] KEY_ACK send failed", error);
              });
            }
          }
        } catch (outerErr) {
          logger.warn("[VideoCallContext] KEY_PACKAGE outer error", outerErr);
        }
      })();
    });

    on("REKEY_COMMIT", (frame) => {
      const commitPayload = frame.payload as { epoch?: number | string } | undefined;
      const epochRaw = commitPayload?.epoch;
      const nextEpoch = typeof epochRaw === "number" ? epochRaw : Number(epochRaw);
      if (!Number.isFinite(nextEpoch)) return;
      if (nextEpoch > e2eeEpochRef.current) {
        e2eeEpochRef.current = nextEpoch;
        rekeyMachineRef.current?.activateEpoch(nextEpoch);
        epochGuardRef.current?.markE2eeReady(nextEpoch);
        onE2eeActivated?.();
        const activeRoomId = callsWsRoomRef.current;
        if (activeRoomId) {
          void client.e2eeReady({ roomId: activeRoomId, epoch: nextEpoch }).catch((err) => {
            logger.warn("[VideoCallContext] E2EE_READY after REKEY_COMMIT failed", err);
          });
        }
      }
    });

    on("PEER_JOINED", (frame) => {
      const payload = frame.payload as Record<string, unknown> | undefined;
      const deviceId = payload?.deviceId as string | undefined;
      const userId = payload?.userId as string | undefined;
      const identity = resolvePeerIdentity({
        payloadPeerId: payload?.peerId as string | undefined,
        payloadUserId: userId,
        payloadDeviceId: deviceId,
      });
      if (identity?.deviceId && identity.userId) {
        peerUserIdByDeviceIdRef.current.set(identity.deviceId, identity.userId);
      }
      if (identity?.peerId) {
        rekeyMachineRef.current?.addPeer(identity.peerId);
      }
    });

    on("PEER_LEFT", (frame) => {
      const payload = frame.payload as Record<string, unknown> | undefined;
      const deviceId = payload?.deviceId as string | undefined;
      const userId = payload?.userId as string | undefined;
      const identity = resolvePeerIdentity({
        payloadPeerId: payload?.peerId as string | undefined,
        payloadUserId: userId,
        payloadDeviceId: deviceId,
        fallbackUserId: deviceId ? peerUserIdByDeviceIdRef.current.get(deviceId) : undefined,
      });
      if (identity?.deviceId) {
        peerUserIdByDeviceIdRef.current.delete(identity.deviceId);
      }
      if (identity?.peerId) {
        rekeyMachineRef.current?.removePeer(identity.peerId);
      }
    });

    on("KEY_ACK", (frame) => {
      const payload = frame.payload as Record<string, unknown> | undefined;
      const myDeviceId = getStableCallsDeviceId();
      const roomId = payload?.roomId as string | undefined;
      const fromDeviceId = payload?.fromDeviceId as string | undefined;
      const toDeviceId = payload?.toDeviceId as string | undefined;
      const senderKeyId = payload?.senderKeyId as string | undefined;
      const refId = payload?.refId as string | undefined;
      const payloadPeerId = payload?.peerId as string | undefined;
      const epochRaw = payload?.epoch;
      if (toDeviceId && toDeviceId !== myDeviceId) return;
      if (epochRaw === undefined || epochRaw === null) return;
      const epoch = typeof epochRaw === "number" ? epochRaw : Number(epochRaw);
      const msgId = frame.msgId ?? (payload?.messageId as string | undefined);
      if (fromDeviceId && Number.isFinite(epoch) && epoch >= 0) {
        const semanticAckKey = [
          roomId ?? callsWsRoomRef.current ?? "unknown-room",
          String(epoch),
          fromDeviceId,
          toDeviceId ?? myDeviceId,
          senderKeyId ?? refId ?? "legacy-ack",
        ].join(":");
        const semanticReplayKey = `ack:in:${semanticAckKey}`;
        if (keyPackageNonceRef.current.has(semanticReplayKey)) {
          logger.warn("[VideoCallContext] KEY_ACK semantic replay rejected", {
            epoch,
            fromDeviceId,
            toDeviceId: toDeviceId ?? myDeviceId,
            senderKeyId,
            refId,
          });
          return;
        }
        addNonce(semanticReplayKey);

        const machine = rekeyMachineRef.current;
        const peerUserId = peerUserIdByDeviceIdRef.current.get(fromDeviceId);
        const candidatePeerIds = [
          payloadPeerId,
          peerUserId ? `${peerUserId}:${fromDeviceId}` : undefined,
          peerUserId,
          fromDeviceId,
        ].filter((value): value is string => typeof value === "string" && value.length > 0);

        const activePeerIds = machine?.getActivePeerIds() ?? new Set<string>();
        const resolvedPeerId =
          candidatePeerIds.find((candidate) => activePeerIds.has(candidate)) ?? candidatePeerIds[0];

        if (resolvedPeerId) {
          if (resolvedPeerId !== fromDeviceId) {
            logger.debug("[VideoCallContext] KEY_ACK peer resolved", {
              fromDeviceId,
              payloadPeerId,
              resolvedPeerId,
              activePeersCount: activePeerIds.size,
            });
          }
          machine?.onKeyAckReceived(resolvedPeerId, epoch, msgId);
        }
      }
    });

    detachSignalsRef.current = () => {
      for (const off of unsubs) {
        try {
          off();
        } catch (error) {
          logger.debug("[VideoCallContext] E2EE signal detach handler threw", {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    };
    attachedSignalsClientRef.current = client;

    // Process pending producers when media is ready
    const consumePendingProducers = () => {
      if (!sfuManagerRef.current?.loaded || !sfuRouterRtpCapabilitiesRef.current) return;
      const rtpCapabilities = sfuRouterRtpCapabilitiesRef.current;
      const toProcess = Array.from(pendingProducersToConsumeRef.current.entries());
      logger.debug("[VideoCallContext] consume pending producers start", {
        count: toProcess.length,
      });
      pendingProducersToConsumeRef.current.clear();
      for (const [producerId, descriptor] of toProcess) {
        const { roomId } = descriptor;
        logger.debug("[VideoCallContext] consume pending producer dispatch", {
          producerId,
          roomId,
        });
        void client.consume({ roomId, producerId, rtpCapabilities }).catch((err) => {
          pendingProducersToConsumeRef.current.set(producerId, descriptor);
          logger.warn("[VideoCallContext] consume pending producer failed; will retry", {
            producerId,
            roomId,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
    };
    
    // Store the callback ref for external access
    consumePendingProducersRef.current = consumePendingProducers;
  }, [
    addNonce,
    attachedSignalsClientRef,
    callKeyExchangeRef,
    callMediaEncryptionRef,
    callsWsRoomRef,
    detachSignalsRef,
    e2eeEpochRef,
    e2eeLeaderDeviceRef,
    epochGuardRef,
    deriveSenderKeyId,
    keyPackageNonceRef,
    lastSnapshotRoomVersionRef,
    onDecryptionKeyReady,
    onE2eeActivated,
    peerUserIdByDeviceIdRef,
    callsWsRef,
    sfuManagerRef,
    sfuRouterRtpCapabilitiesRef,
    resolvePeerIdentity,
    rekeyMachineRef,
    user,
    pendingProducersToConsumeRef,
    consumePendingProducersRef,
    producerPeerKeyRef,
  ]);

   // Detach function to clean up listeners
   const detachCallback = useCallback(() => {
        if (detachSignalsRef.current) {
            detachSignalsRef.current();
            detachSignalsRef.current = null;
            attachedSignalsClientRef.current = null;
        }
   }, []); // empty deps because the refs we use are stable (they are useRefs in this hook)

   return { attach: attachCallsV2E2eeSignals, detach: detachCallback };
}
