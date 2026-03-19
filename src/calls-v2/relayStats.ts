export type IceCandidateType = "host" | "srflx" | "prflx" | "relay" | "unknown";

export interface SelectedIcePair {
  pairId: string;
  localCandidateType: IceCandidateType;
  remoteCandidateType: IceCandidateType;
  localCandidateId?: string;
  remoteCandidateId?: string;
}

type AnyStats = Record<string, unknown>;

type StatsLike =
  | Iterable<[string, AnyStats]>
  | Map<string, AnyStats>
  | { forEach: (callback: (value: AnyStats, key: string) => void) => void };

function normalizeCandidateType(value: unknown): IceCandidateType {
  const raw = typeof value === "string" ? value.toLowerCase() : "";
  if (raw === "host" || raw === "srflx" || raw === "prflx" || raw === "relay") {
    return raw;
  }
  return "unknown";
}

function toEntries(stats: StatsLike): Array<[string, AnyStats]> {
  if (stats instanceof Map) {
    return Array.from(stats.entries());
  }

  if (typeof (stats as { forEach?: unknown }).forEach === "function") {
    const out: Array<[string, AnyStats]> = [];
    (stats as { forEach: (callback: (value: AnyStats, key: string) => void) => void }).forEach(
      (value, key) => out.push([key, value]),
    );
    return out;
  }

  return Array.from(stats as Iterable<[string, AnyStats]>);
}

/**
 * Extract selected ICE candidate pair from a RTCStatsReport-like container.
 * Works with WebRTC stats snapshots from browser APIs and unit-test maps.
 */
export function extractSelectedIcePair(stats: StatsLike): SelectedIcePair | null {
  const entries = toEntries(stats);
  const byId = new Map<string, AnyStats>(entries);

  let selectedPairId: string | null = null;
  for (const [, item] of entries) {
    if ((item as AnyStats).type === "transport") {
      const candidatePairId = (item as AnyStats).selectedCandidatePairId;
      if (typeof candidatePairId === "string" && candidatePairId) {
        selectedPairId = candidatePairId;
        break;
      }
    }
  }

  if (!selectedPairId) {
    for (const [id, item] of entries) {
      if ((item as AnyStats).type !== "candidate-pair") continue;
      const state = String((item as AnyStats).state ?? "").toLowerCase();
      const nominated = (item as AnyStats).nominated === true;
      const selected = (item as AnyStats).selected === true;
      if (selected || (nominated && state === "succeeded")) {
        selectedPairId = id;
        break;
      }
    }
  }

  if (!selectedPairId) return null;

  const pair = byId.get(selectedPairId);
  if (!pair || pair.type !== "candidate-pair") return null;

  const localCandidateId =
    typeof pair.localCandidateId === "string" ? pair.localCandidateId : undefined;
  const remoteCandidateId =
    typeof pair.remoteCandidateId === "string" ? pair.remoteCandidateId : undefined;

  const local = localCandidateId ? byId.get(localCandidateId) : undefined;
  const remote = remoteCandidateId ? byId.get(remoteCandidateId) : undefined;

  return {
    pairId: selectedPairId,
    localCandidateId,
    remoteCandidateId,
    localCandidateType: normalizeCandidateType(local?.candidateType),
    remoteCandidateType: normalizeCandidateType(remote?.candidateType),
  };
}

/**
 * Gate helper: call is considered relay-routed only when selected local candidate is TURN relay.
 */
export function isRelaySelected(stats: StatsLike): boolean {
  const selected = extractSelectedIcePair(stats);
  return selected?.localCandidateType === "relay";
}
