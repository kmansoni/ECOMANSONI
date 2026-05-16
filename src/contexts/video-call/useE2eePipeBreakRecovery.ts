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
        const track = sfuManager.closeProducer(trackId);
        if (!track || track.readyState !== 'live') {
          logger.error('[VideoCallContext] E2EE sender recovery: track dead', { trackId });
          toast.error('Ошибка шифрования — медиа-трек недоступен');
          return;
        }

        logger.info('[VideoCallContext] E2EE sender pipe recovery: re-producing', { trackId });
        const newProducer = await sfuManager.produce(track, { trackId: track.id });

        if (sfuManagerRef.current !== sfuManager || sfuManager.closed) {
          logger.warn('[VideoCallContext] E2EE sender recovery aborted: stale SFU manager', {
            oldProducerId: trackId,
            newProducerId: newProducer.id,
          });
          sfuManager.closeProducer(newProducer.id);
          return;
        }

        if (sfuManager.getProducerSender(newProducer.id)) {
          encryption.setupSenderTransform(sfuManager.getProducerSender(newProducer.id)!, newProducer.id);
        }

        logger.info('[VideoCallContext] E2EE sender pipe recovery: OK', {
          oldProducerId: trackId,
          newProducerId: newProducer.id,
        });
      } else {
        const storedParams = consumerCreateParamsRef.current.get(trackId);
        if (!storedParams) {
          logger.error('[VideoCallContext] E2EE receiver recovery: no stored params', { trackId, peerId });
          toast.error('Ошибка дешифровки — параметры потеряны');
          return;
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
        });

        if (sfuManagerRef.current !== sfuManager || sfuManager.closed) {
          logger.warn('[VideoCallContext] E2EE receiver recovery aborted: stale SFU manager', {
            oldConsumerId: trackId,
            newConsumerId: newConsumer.id,
          });
          sfuManager.closeConsumer(newConsumer.id);
          return;
        }

        consumerCreateParamsRef.current.set(newConsumer.id, storedParams);

        const newReceiver = sfuManager.getConsumerReceiver(newConsumer.id);
        if (newReceiver && storedParams.producerId) {
          encryption.setupReceiverTransform(newReceiver, storedParams.producerId, newConsumer.id);
        }

        const client = callsWsRef.current;
        const roomId = callsWsMediaRoomRef.current;
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