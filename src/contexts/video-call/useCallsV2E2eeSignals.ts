import { useCallback, useRef } from "react";
import { logger } from "@/lib/logger";
import { getStableCallsDeviceId } from "@/lib/platform/device";
import { CallKeyExchange, type KeyPackageData } from "../../calls-v2/callKeyExchange";
import { CallMediaEncryption } from "../../calls-v2/callMediaEncryption";
import { RekeyStateMachine } from "../../calls-v2/rekeyStateMachine";
import { EpochGuard } from "@/calls-v2/epochGuard";
import type { CallsWsClient } from "@/calls-v2/wsClient";
import { getOrCreateIdentityKeyPair, signIdentity, exportPublicKey as exportEcdsaPublicKey, verifyIdentity, importPublicKey } from "@/calls-v2/ecdsaIdentity";

interface UseCallsV2E2eeSignalsParams {
  user: { id: string } | null;
  callsWsRoomRef: { current: string | null };
  lastSnapshotRoomVersionRef: { current: number };
  e2eeEpochRef: { current: number };
  e2eeLeaderDeviceRef: { current: string | null };
  keyPackageNonceRef: { current: Set<string> };
  callKeyExchangeRef: { current: CallKeyExchange | null };
  callMediaEncryptionRef: { current: CallMediaEncryption | null };
  rekeyMachineRef: { current: RekeyStateMachine | null };
  epochGuardRef: { current: EpochGuard | null };
  producerPeerKeyRef: { current: Map<string, string> };
  peerUserIdByDeviceIdRef: { current: Map<string, string> };
}

export function useCallsV2E2eeSignals({
  user,
  callsWsRoomRef,
  lastSnapshotRoomVersionRef,
  e2eeEpochRef,
  e2eeLeaderDeviceRef,
  keyPackageNonceRef,
  callKeyExchangeRef,
  callMediaEncryptionRef,
  rekeyMachineRef,
  epochGuardRef,
  producerPeerKeyRef,
  peerUserIdByDeviceIdRef,
}: UseCallsV2E2eeSignalsParams) {
  const attachedSignalsClientRef = useRef<CallsWsClient | null>(null);
  const detachSignalsRef = useRef<(() => void) | null>(null);

  const base64ToBytes = useCallback((b64: string): Uint8Array => {
    return Uint8Array.from(atob(b64), (char) => char.charCodeAt(0));
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
        roomVersion?: number | string;
        e2ee?: { leaderDeviceId?: string };
        peers?: Array<{ peerId?: string; userId?: string; deviceId?: string }>;
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
      keyPackageNonceRef.current.add(nonce);
      if (keyPackageNonceRef.current.size > 2000) {
        const keep = Array.from(keyPackageNonceRef.current).slice(-1000);
        keyPackageNonceRef.current = new Set(keep);
      }

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
          const epochKey = await keyExchange.createEpochKey(epoch);
          await mediaEncryption.setEncryptionKey(epochKey);

          const senderPublicKey = await keyExchange.getPublicKeyBase64();
          const senderKeyId = await deriveSenderKeyId(senderPublicKey);
          const sessionIdForDiscovery = keyExchange.getSessionId();
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
          );
          const identityPubKeyJwk = await exportEcdsaPublicKey(identityKeyPair.publicKey);
          const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sigBytes)));

          const discoveryNonce = crypto.randomUUID();
          const mySigningPublicKey = await keyExchange.getSigningPublicKeyBase64();
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
            salt: "",
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

          // Non-discovery packets MUST have a signature (C-1 fix: prevents MITM downgrade to plaintext)
          if (!isDiscovery && (!sigB64 || sigB64.length === 0)) {
            logger.warn("[VideoCallContext] KEY_PACKAGE rejected: missing signature on non-discovery packet", { epoch, roomId });
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

          if (keyExchange && mediaEncryption && senderPublicKeyB64 && ciphertextB64 && (sigB64 || isDiscovery)) {
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
              senderIdentity: {
                userId: senderUserId,
                deviceId: senderDeviceId,
                sessionId: senderSessionId,
              },
            };

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
              keyPackageNonceRef.current.add(replayNonceKey);
              if (keyPackageNonceRef.current.size > 2000) {
                const keep = Array.from(keyPackageNonceRef.current).slice(-1000);
                keyPackageNonceRef.current = new Set(keep);
              }

              const leaderDeviceId = e2eeLeaderDeviceRef.current;
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
                    const valid = await verifyIdentity(
                      senderVerifyKey,
                      senderUserId,
                      senderDeviceId,
                      senderSessionId,
                      senderPublicKeyB64,
                      ciphertextB64,
                      epoch,
                      senderSalt,
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
                  const current = keyExchange.getCurrentEpochKey();
                  const epochKey = current?.epoch === epoch ? current : await keyExchange.createEpochKey(epoch);
                  await mediaEncryption.setEncryptionKey(epochKey);

                  const pkg = await keyExchange.createKeyPackage(senderPublicKeyB64, epoch);
                  const senderKeyId = await deriveSenderKeyId(pkg.senderPublicKey);
                  const leaderSessionId = keyExchange.getSessionId();
                  const leaderSigningPublicKey = await keyExchange.getSigningPublicKeyBase64();
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
              keyPackageNonceRef.current.add(semanticReplayKey);
              if (keyPackageNonceRef.current.size > 2000) {
                const keep = Array.from(keyPackageNonceRef.current).slice(-1000);
                keyPackageNonceRef.current = new Set(keep);
              }
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
        keyPackageNonceRef.current.add(semanticReplayKey);
        if (keyPackageNonceRef.current.size > 2000) {
          const keep = Array.from(keyPackageNonceRef.current).slice(-1000);
          keyPackageNonceRef.current = new Set(keep);
        }

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
  }, [
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
    peerUserIdByDeviceIdRef,
    resolvePeerIdentity,
    rekeyMachineRef,
    user,
  ]);

  return { attachCallsV2E2eeSignals };
}
