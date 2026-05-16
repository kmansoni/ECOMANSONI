import { useCallback } from "react";
import { logger } from "@/lib/logger";
import { getStableCallsDeviceId } from "@/lib/platform/device";
import { CallKeyExchange, type KeyPackageData } from "../../calls-v2/callKeyExchange";
import { CallMediaEncryption } from "../../calls-v2/callMediaEncryption";
import { RekeyStateMachine } from "../../calls-v2/rekeyStateMachine";
import { EpochGuard } from "@/calls-v2/epochGuard";
import type { CallsWsClient } from "@/calls-v2/wsClient";
import type { PipeBreakInfo } from "@/lib/e2ee/insertableStreams";
import { getOrCreateIdentityKeyPair, signIdentity, exportPublicKey as exportEcdsaPublicKey } from "@/calls-v2/ecdsaIdentity";

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
  handleE2eePipeBreakRef: { current: ((info: PipeBreakInfo) => void) | null };
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
  handleE2eePipeBreakRef,
}: UseCallsV2E2eeSignalsParams) {
  const attachCallsV2E2eeSignals = useCallback((client: CallsWsClient): void => {
    client.on("AUTH_FAIL", (frame) => {
      logger.warn("[VideoCallContext] calls-v2 auth-fail", { payload: frame.payload });
    });

    client.on("ERROR", (frame) => {
      logger.warn("[VideoCallContext] calls-v2 server-error", {
        type: frame.type,
        payload: frame.payload,
        ack: frame.ack,
      });
    });

    client.on("ROOM_LEFT", (frame) => {
      logger.warn("[VideoCallContext] calls-v2 room-left", { payload: frame.payload });
    });

    client.on("ROOM_SNAPSHOT", (frame) => {
      const snapshot = frame.payload as {
        roomVersion?: number | string;
        e2ee?: { leaderDeviceId?: string };
        peers?: Array<{ peerId?: string; deviceId?: string }>;
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
        const peerIds: string[] = (snapshot.peers as Array<{ peerId?: string; deviceId?: string }>)
          .map((p) => p.peerId ?? p.deviceId ?? "")
          .filter(Boolean);
        rekeyMachineRef.current?.setActivePeers(peerIds);

        for (const peer of snapshot.peers as Array<{ peerId?: string; deviceId?: string }>) {
          if (!peer?.peerId || !peer?.deviceId) continue;
          const peerUserId = peer.peerId.split(":")[0] || "";
          if (peerUserId) {
            peerUserIdByDeviceIdRef.current.set(peer.deviceId, peerUserId);
          }
        }
      }
    });

    client.on("REKEY_BEGIN", (frame) => {
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

    client.on("KEY_PACKAGE", (frame) => {
      const activeRoomId = callsWsRoomRef.current;
      const keyPkgPayload = frame.payload as {
        roomId?: string;
        targetDeviceId?: string;
        epoch?: number | string;
      } | undefined;
      const roomId = keyPkgPayload?.roomId;
      if (!activeRoomId || !roomId || roomId !== activeRoomId) return;

      const myDeviceId = getStableCallsDeviceId();
      const targetDeviceId = keyPkgPayload?.targetDeviceId;
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

          if (keyExchange && mediaEncryption && senderPublicKeyB64 && ciphertextB64) {
            const senderIdentityObj = rawPayload?.senderIdentity as
              | { userId?: string; deviceId?: string; sessionId?: string }
              | undefined;
            const senderUserId = senderIdentityObj?.userId
              ?? (rawPayload?.fromUserId as string | undefined)
              ?? (rawPayload?.fromDeviceId as string | undefined)
              ?? "unknown";
            const senderDeviceId = senderIdentityObj?.deviceId
              ?? (rawPayload?.fromDeviceId as string | undefined)
              ?? "";
            const senderSessionId = senderIdentityObj?.sessionId ?? "";

            const senderSigningKeyB64 = rawPayload?.senderSigningPublicKey as string | undefined;
            if (senderSigningKeyB64 && senderDeviceId) {
              const composedPeerId = `${senderUserId}:${senderDeviceId}`;
              try {
                await keyExchange.registerPeerSigningKey(composedPeerId, senderSigningKeyB64);
              } catch (regErr) {
                logger.warn("[VideoCallContext] registerPeerSigningKey failed", {
                  peerId: composedPeerId,
                  error: regErr instanceof Error
                    ? { name: regErr.name, message: regErr.message }
                    : String(regErr),
                });
              }
            }

            const pkgData: KeyPackageData = {
              senderPublicKey: senderPublicKeyB64,
              ciphertext: ciphertextB64,
              sig: sigB64,
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

            let keyExchangeSuccess = false;

            try {
              const peerEpochKey = await keyExchange.processKeyPackage(pkgData);
              const peerKey = senderDeviceId ? `${senderUserId}:${senderDeviceId}` : senderUserId;
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

    client.on("REKEY_COMMIT", (frame) => {
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

    client.on("PEER_JOINED", (frame) => {
      const peerId = (frame.payload as Record<string, unknown> | undefined)?.peerId as string | undefined;
      if (peerId) {
        rekeyMachineRef.current?.addPeer(peerId);
      }
    });

    client.on("PEER_LEFT", (frame) => {
      const peerId = (frame.payload as Record<string, unknown> | undefined)?.peerId as string | undefined;
      if (peerId) {
        rekeyMachineRef.current?.removePeer(peerId);
      }
    });

    client.on("KEY_ACK", (frame) => {
      const payload = frame.payload as Record<string, unknown> | undefined;
      const fromDeviceId = payload?.fromDeviceId as string | undefined;
      const epochRaw = payload?.epoch;
      if (epochRaw === undefined || epochRaw === null) return;
      const epoch = typeof epochRaw === "number" ? epochRaw : Number(epochRaw);
      const msgId = frame.msgId ?? (payload?.messageId as string | undefined);
      if (fromDeviceId && Number.isFinite(epoch) && epoch >= 0) {
        rekeyMachineRef.current?.onKeyAckReceived(fromDeviceId, epoch, msgId);
      }
    });
  }, [
    callKeyExchangeRef,
    callMediaEncryptionRef,
    callsWsRoomRef,
    e2eeEpochRef,
    e2eeLeaderDeviceRef,
    keyPackageNonceRef,
    lastSnapshotRoomVersionRef,
    peerUserIdByDeviceIdRef,
    rekeyMachineRef,
    user,
  ]);

  return { attachCallsV2E2eeSignals };
}
