import { useCallback, useEffect } from "react";
import { logger } from "@/lib/logger";
import { toast } from "sonner";
import type { PipeBreakInfo } from "@/lib/e2ee/insertableStreams";
import type { ConsumedPayload } from "@/calls-v2/types";
import type { SfuMediaManager } from "@/calls-v2/sfuMediaManager";
import type { CallMediaEncryption } from "@/calls-v2/callMediaEncryption";
import type { CallsWsClient } from "@/calls-v2/wsClient";

const RECOVERY_DEBOUNCE_MS = 10_000;

export function useE2eePipeBreakRecovery(
  sfuManagerRef: { current: SfuMediaManager | null },
  callMediaEncryptionRef: { current: CallMediaEncryption | null },
  callsWsRef: { current: CallsWsClient | null },
  callsWsMediaRoomRef: { current: string | null },
  consumerCreateParamsRef: { current: Map<string, ConsumedPayload> },
  localProducerIdsRef: { current: { audio: string | null; video: string | null } },
  producerPeerKeyRef: { current: Map<string, string> },
  pipeBreakRetryAtRef: { current: Map<string, number> },
  pipeBreakRecoveryInFlightRef: { current: Set<string> },
  handleE2eePipeBreakRef: { current: ((info: PipeBreakInfo) => void) | null },
  rebuildRemoteStream: () => void,
): void {
  const handleE2eePipeBreak = useCallback(async (info: PipeBreakInfo) => {
    const { trackId, direction, peerId } = info;
    const recoveryKey = `${trackId}:${direction}`;

    const lastRetry = pipeBreakRetryAtRef.current.get(trackId) ?? 0;
    if (Date.now() - lastRetry < RECOVERY_DEBOUNCE_MS) {
      logger.warn('[VideoCallContext] E2EE pipe break recovery throttled', { trackId, direction });
      return;
    }

    if (pipeBreakRecoveryInFlightRef.current.has(recoveryKey)) {
      logger.warn('[VideoCallContext] E2EE pipe break recovery skipped: already in flight', { trackId, direction });
      return;
    }

    pipeBreakRetryAtRef.current.set(trackId, Date.now());
    pipeBreakRecoveryInFlightRef.current.add(recoveryKey);

    const sfuManager = sfuManagerRef.current;
    const encryption = callMediaEncryptionRef.current;
    if (!sfuManager || !encryption) {
      logger.error('[VideoCallContext] E2EE pipe recovery impossible — no sfuManager or encryption', { trackId });
      toast.error('Ошибка шифрования — переподключение невозможно');
      pipeBreakRecoveryInFlightRef.current.delete(recoveryKey);
      return;
    }

    try {
      if (direction === 'encrypt') {
        const client = callsWsRef.current;
        const roomId = callsWsMediaRoomRef.current;
        if (client && roomId) {
          await client.producerClose({ roomId, producerId: trackId }).catch((error) => {
            logger.warn('[VideoCallContext] E2EE sender recovery producerClose failed', { trackId, roomId, error });
          });
        }
        const previousAppData = sfuManager.getProducerAppData(trackId) ?? {};
        const track = sfuManager.closeProducer(trackId);
        if (!track || track.readyState !== 'live') {
          logger.error('[VideoCallContext] E2EE sender recovery: track dead', { trackId });
          toast.error('Ошибка шифрования — медиа-трек недоступен');
          return;
        }

        const previousSource = typeof previousAppData.source === 'string' ? previousAppData.source : null;
        const source = previousSource ?? (track.kind === 'audio' ? 'microphone' : 'camera');
        logger.info('[VideoCallContext] E2EE sender pipe recovery: re-producing', { trackId });
        const newProducer = await sfuManager.produce(track, { ...previousAppData, trackId: track.id, source });

        if (sfuManagerRef.current !== sfuManager || sfuManager.closed) {
          logger.warn('[VideoCallContext] E2EE sender recovery aborted: stale or closed SFU manager', {
            oldProducerId: trackId,
            newProducerId: newProducer.id,
          });
          if (client && roomId) {
            await client.producerClose({ roomId, producerId: newProducer.id }).catch((error) => {
              logger.warn('[VideoCallContext] E2EE sender recovery stale producerClose failed', { producerId: newProducer.id, roomId, error });
            });
          }
          sfuManager.closeProducer(newProducer.id);
          return;
        }

        const sender = sfuManager.getProducerSender(newProducer.id);
        if (sender) {
          encryption.setupSenderTransform(sender, newProducer.id);
        }
        if ((track.kind === 'audio' || track.kind === 'video') && localProducerIdsRef.current[track.kind] === trackId) {
          localProducerIdsRef.current[track.kind] = newProducer.id;
        }

        logger.info('[VideoCallContext] E2EE sender pipe recovery: OK', {
          oldProducerId: trackId,
          newProducerId: newProducer.id,
        });
      } else {
        const client = callsWsRef.current;
        const roomId = callsWsMediaRoomRef.current;
        const storedParams = consumerCreateParamsRef.current.get(trackId);
        if (!storedParams) {
          logger.error('[VideoCallContext] E2EE receiver recovery: no stored params', { trackId, peerId });
          toast.error('Ошибка дешифровки — параметры потеряны');
          return;
        }

        if (client && roomId) {
          await client.consumerClose({ roomId, consumerId: trackId }).catch((error) => {
            logger.warn('[VideoCallContext] E2EE receiver recovery consumerClose failed', { consumerId: trackId, roomId, error });
          });
        }
        sfuManager.closeConsumer(trackId);
        logger.info('[VideoCallContext] E2EE receiver pipe recovery: re-consuming', {
          consumerId: trackId,
          producerId: storedParams.producerId,
        });

        const newConsumer = await sfuManager.consume({
          id: storedParams.consumerId,
          producerId: storedParams.producerId,
          kind: storedParams.kind as import('mediasoup-client').types.MediaKind,
          rtpParameters: storedParams.rtpParameters as import('mediasoup-client').types.RtpParameters,
          source: storedParams.source,
        });

        if (sfuManagerRef.current !== sfuManager || sfuManager.closed) {
          logger.warn('[VideoCallContext] E2EE receiver recovery aborted: stale or closed SFU manager', {
            oldConsumerId: trackId,
            newConsumerId: newConsumer.id,
          });
          if (client && roomId) {
            await client.consumerClose({ roomId, consumerId: newConsumer.id }).catch((error) => {
              logger.warn('[VideoCallContext] E2EE receiver recovery stale consumerClose failed', { consumerId: newConsumer.id, roomId, error });
            });
          }
          sfuManager.closeConsumer(newConsumer.id);
          return;
        }

        consumerCreateParamsRef.current.set(newConsumer.id, storedParams);

        const newReceiver = sfuManager.getConsumerReceiver(newConsumer.id);
        const peerKey = peerId
          || storedParams.peerId
          || producerPeerKeyRef.current.get(storedParams.producerId)
          || storedParams.producerId;
        if (newReceiver) {
          encryption.setupReceiverTransform(newReceiver, peerKey, newConsumer.id);
        }

        if (client && roomId) {
          await client.consumerResume({ roomId, consumerId: newConsumer.id });
        }
        rebuildRemoteStream();

        logger.info('[VideoCallContext] E2EE receiver pipe recovery: OK', {
          oldConsumerId: trackId,
          newConsumerId: newConsumer.id,
        });
      }
    } catch (err) {
      logger.error('[VideoCallContext] E2EE pipe recovery failed', { trackId, direction, error: err });
      toast.error(
        direction === 'encrypt'
          ? 'Ошибка шифрования медиа — собеседник может не слышать вас'
          : 'Ошибка дешифровки медиа — вы можете не слышать собеседника'
      );
    } finally {
      pipeBreakRecoveryInFlightRef.current.delete(recoveryKey);
    }
  }, [
    sfuManagerRef,
    callMediaEncryptionRef,
    callsWsRef,
    callsWsMediaRoomRef,
    consumerCreateParamsRef,
    localProducerIdsRef,
    producerPeerKeyRef,
    pipeBreakRetryAtRef,
    pipeBreakRecoveryInFlightRef,
    rebuildRemoteStream,
  ]);

  useEffect(() => {
    handleE2eePipeBreakRef.current = handleE2eePipeBreak;

    return () => {
      if (handleE2eePipeBreakRef.current === handleE2eePipeBreak) {
        handleE2eePipeBreakRef.current = null;
      }
    };
  }, [handleE2eePipeBreak, handleE2eePipeBreakRef]);
}