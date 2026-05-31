import { useEffect, type MutableRefObject } from "react";
import { logger } from "@/lib/logger";
import type { SfuMediaManager } from "@/calls-v2/sfuMediaManager";

interface Params {
  legacyEngineActive: boolean;
  currentCallId: string | undefined;
  sfuManagerRef: MutableRefObject<SfuMediaManager | null>;
  relayMetricsTimerRef: MutableRefObject<number | null>;
  relayMetricsLastLogAtRef: MutableRefObject<number>;
  relayMetricsLastSignatureRef: MutableRefObject<string>;
}

export function useRelayMetrics({
  legacyEngineActive,
  currentCallId,
  sfuManagerRef,
  relayMetricsTimerRef,
  relayMetricsLastLogAtRef,
  relayMetricsLastSignatureRef,
}: Params) {
  useEffect(() => {
    if (legacyEngineActive || !currentCallId) return;

    if (relayMetricsTimerRef.current) {
      window.clearInterval(relayMetricsTimerRef.current);
      relayMetricsTimerRef.current = null;
    }

    relayMetricsTimerRef.current = window.setInterval(() => {
      const manager = sfuManagerRef.current;
      if (!manager) return;

      void manager.sampleRelayMetrics().then((snapshot) => {
        if (!snapshot) return;

        const now = Date.now();
        const signature = [
          snapshot.aggregate.relay_fallback_count,
          snapshot.aggregate.total_samples,
          snapshot.send?.isRelaySelected ? 1 : 0,
          snapshot.recv?.isRelaySelected ? 1 : 0,
        ].join(":");

        if (
          signature !== relayMetricsLastSignatureRef.current ||
          now - relayMetricsLastLogAtRef.current > 15000
        ) {
          relayMetricsLastSignatureRef.current = signature;
          relayMetricsLastLogAtRef.current = now;
          logger.info("useRelayMetrics.snapshot", {
            callId: currentCallId.slice(0, 8),
            sendRelay: !!snapshot.send?.isRelaySelected,
            recvRelay: !!snapshot.recv?.isRelaySelected,
            relayUsageRate: snapshot.aggregate.relay_usage_rate,
            relayFallbackCount: snapshot.aggregate.relay_fallback_count,
            totalSamples: snapshot.aggregate.total_samples,
            avgBytesOverRelay: snapshot.aggregate.avg_bytes_over_relay,
          });
        }
      }).catch((error) => {
        logger.debug("useRelayMetrics.sample_failed", { error });
      });
    }, 5000);

    return () => {
      if (relayMetricsTimerRef.current) {
        window.clearInterval(relayMetricsTimerRef.current);
        relayMetricsTimerRef.current = null;
      }
    };
  }, [legacyEngineActive, currentCallId, sfuManagerRef, relayMetricsTimerRef, relayMetricsLastLogAtRef, relayMetricsLastSignatureRef]);
}
