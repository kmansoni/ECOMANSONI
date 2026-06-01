import { useEffect, useRef } from "react";
import { logger } from "@/lib/logger";
import type { SfuMediaManager } from "@/calls-v2/sfuMediaManager";
import type { CallsWsClient } from "@/calls-v2/wsClient";
import type { SerializedProducer } from "@/calls-v2/types";

const PROBE_ENABLED = String(import.meta.env.VITE_CALLS_PRODUCER_PROBE ?? "true").trim() !== "false";
const PROBE_INTERVAL_MS = 15_000;
const PROBE_START_DELAY_MS = 5_000;

interface ProbeState {
  firstObserved: Map<string, number>;
  startedAt: number;
}

export function useProducerCoverageProbe(
  sfuManagerRef: { current: SfuMediaManager | null },
  callsWsRef: { current: CallsWsClient | null },
  callsWsMediaRoomRef: { current: string | null },
): void {
  const stateRef = useRef<ProbeState>({ firstObserved: new Map(), startedAt: 0 });
  const pollIndexRef = useRef(0);

  useEffect(() => {
    if (!PROBE_ENABLED) return;

    let interval: number | null = null;

    const startTimer = window.setTimeout(() => {
      stateRef.current.startedAt = Date.now();
      void runProbe(sfuManagerRef, callsWsRef, callsWsMediaRoomRef, stateRef, pollIndexRef);
      interval = window.setInterval(() => {
        void runProbe(sfuManagerRef, callsWsRef, callsWsMediaRoomRef, stateRef, pollIndexRef);
      }, PROBE_INTERVAL_MS);
    }, PROBE_START_DELAY_MS);

    return () => {
      window.clearTimeout(startTimer);
      if (interval !== null) window.clearInterval(interval);
      stateRef.current.firstObserved.clear();
      pollIndexRef.current = 0;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

async function runProbe(
  sfuManagerRef: { current: SfuMediaManager | null },
  callsWsRef: { current: CallsWsClient | null },
  callsWsMediaRoomRef: { current: string | null },
  stateRef: { current: ProbeState },
  pollIndexRef: { current: number },
): Promise<void> {
  const client = callsWsRef.current;
  const sfuManager = sfuManagerRef.current;
  const roomId = callsWsMediaRoomRef.current;
  if (!client || !sfuManager || !roomId) return;

  const pollIndex = pollIndexRef.current++;
  const timeSinceJoinMs = stateRef.current.startedAt ? Date.now() - stateRef.current.startedAt : null;

  // Request snapshot — fire and wait for ROOM_STATE push
  let serverProducers: SerializedProducer[];
  try {
    const [snapshot] = await Promise.all([
      client.waitFor(
        "ROOM_STATE" as Parameters<typeof client.waitFor>[0],
        (frame) => (frame.payload as { roomId?: string } | undefined)?.roomId === roomId,
        { timeoutMs: 5000, acceptRecent: false },
      ),
      client.roomStateGet(roomId, 5000),
    ]);
    const payload = snapshot.payload as { producers?: SerializedProducer[] } | undefined;
    serverProducers = payload?.producers ?? [];
  } catch {
    // server doesn't support ROOM_STATE_GET yet — skip silently
    return;
  }

  const localConsumers = sfuManager.getConsumerSnapshot();
  const localProducerIds = new Set(
    localConsumers.filter((c) => !c.closed).map((c) => c.producerId),
  );

  const now = Date.now();
  const { firstObserved } = stateRef.current;

  const missing: Array<{ producerId: string; kind: string; source: string; firstObservedMs: number; persistenceMs: number }> = [];
  const duplicates: Array<{ producerId: string; count: number }> = [];

  // Check coverage
  for (const sp of serverProducers) {
    if (!localProducerIds.has(sp.producerId)) {
      if (!firstObserved.has(sp.producerId)) {
        firstObserved.set(sp.producerId, now);
      }
      const firstSeen = firstObserved.get(sp.producerId)!;
      missing.push({
        producerId: sp.producerId.slice(0, 8),
        kind: sp.kind,
        source: sp.source,
        firstObservedMs: firstSeen,
        persistenceMs: now - firstSeen,
      });
    } else {
      firstObserved.delete(sp.producerId);
    }
  }

  // Check duplicates (multiple consumers for same producerId)
  const countByProducer = new Map<string, number>();
  for (const c of localConsumers) {
    if (!c.closed) countByProducer.set(c.producerId, (countByProducer.get(c.producerId) ?? 0) + 1);
  }
  for (const [producerId, count] of countByProducer) {
    if (count > 1) duplicates.push({ producerId: producerId.slice(0, 8), count });
  }

  if (missing.length === 0 && duplicates.length === 0) return;

  const missingSummary = missing.map((m) => `${m.producerId}/${m.kind}/${m.source}:${m.persistenceMs}ms`).join(",");
  const duplicateSummary = duplicates.map((d) => `${d.producerId}x${d.count}`).join(",");

  logger.warn(
    `CALLS_PRODUCER_COVERAGE_DIFF server=${serverProducers.length} local=${localConsumers.filter((c) => !c.closed).length} missing=[${missingSummary || "none"}] duplicates=[${duplicateSummary || "none"}]`,
    {
    pollIndex,
    timeSinceJoinMs,
    serverProducerCount: serverProducers.length,
    localConsumerCount: localConsumers.filter((c) => !c.closed).length,
    missing,
    duplicates,
    }
  );
}
