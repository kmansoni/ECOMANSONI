import { useCallback, type MutableRefObject } from "react";
import { logger } from "@/lib/logger";
import { getStableCallsDeviceId } from "@/lib/platform/device";
import { CallKeyExchange, type CallIdentity } from "@/calls-v2/callKeyExchange";
import { CallMediaEncryption } from "@/calls-v2/callMediaEncryption";
import { RekeyStateMachine } from "@/calls-v2/rekeyStateMachine";
import { EpochGuard } from "@/calls-v2/epochGuard";
import { CallsWsClient } from "@/calls-v2/wsClient";
import type { PipeBreakInfo } from "@/lib/e2ee/insertableStreams";
import { useCallsV2E2eeSignals } from "./useCallsV2E2eeSignals";

interface UseCallsV2E2eeBootstrapParams {
  user: { id: string } | null;
  callsWsRoomRef: MutableRefObject<string | null>;
  lastSnapshotRoomVersionRef: MutableRefObject<number>;
  e2eeEpochRef: MutableRefObject<number>;
  e2eeLeaderDeviceRef: MutableRefObject<string | null>;
  keyPackageNonceRef: MutableRefObject<Set<string>>;
  callKeyExchangeRef: MutableRefObject<CallKeyExchange | null>;
  callMediaEncryptionRef: MutableRefObject<CallMediaEncryption | null>;
  rekeyMachineRef: MutableRefObject<RekeyStateMachine | null>;
  epochGuardRef: MutableRefObject<EpochGuard | null>;
  producerPeerKeyRef: MutableRefObject<Map<string, string>>;
  peerUserIdByDeviceIdRef: MutableRefObject<Map<string, string>>;
  handleE2eePipeBreakRef: MutableRefObject<((info: PipeBreakInfo) => void) | null>;
}

export function useCallsV2E2eeBootstrap({
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
}: UseCallsV2E2eeBootstrapParams) {
  const { attachCallsV2E2eeSignals } = useCallsV2E2eeSignals({
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
  });

  const initializeCallsV2E2ee = useCallback(async (client: CallsWsClient): Promise<void> => {
    if (!user) return;

    if (!callKeyExchangeRef.current) {
      const identity: CallIdentity = {
        userId: user.id,
        deviceId: getStableCallsDeviceId(),
        sessionId: crypto.randomUUID(),
      };
      const kx = new CallKeyExchange(identity);
      await kx.initialize();
      callKeyExchangeRef.current = kx;
      logger.info("[VideoCallContext] calls-v2 CallKeyExchange initialized");
    }

    if (!callMediaEncryptionRef.current) {
      callMediaEncryptionRef.current = new CallMediaEncryption({
        onError: (err, direction) => {
          logger.warn(`[VideoCallContext] E2EE ${direction} frame error`, { error: err.message });
        },
        onPipeBreak: (info) => {
          logger.error("[VideoCallContext] E2EE pipe broke — starting recovery", info);
          handleE2eePipeBreakRef.current?.(info);
        },
      });
      if (epochGuardRef.current) {
        callMediaEncryptionRef.current.setEpochGuard(epochGuardRef.current);
      }
      logger.info("[VideoCallContext] calls-v2 CallMediaEncryption initialized");
    }

    if (!rekeyMachineRef.current) {
      rekeyMachineRef.current = new RekeyStateMachine();
    }
    if (!epochGuardRef.current) {
      epochGuardRef.current = new EpochGuard(true);
    }
    epochGuardRef.current.markAuthenticated();
    attachCallsV2E2eeSignals(client);
  }, [
    callKeyExchangeRef,
    callMediaEncryptionRef,
    callsWsRoomRef,
    e2eeEpochRef,
    e2eeLeaderDeviceRef,
    epochGuardRef,
    attachCallsV2E2eeSignals,
    peerUserIdByDeviceIdRef,
    rekeyMachineRef,
    user,
  ]);

  return { initializeCallsV2E2ee };
}
