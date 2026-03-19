import { logger } from "@/lib/logger";

/**
 * ICE Candidate типы согласно RFC 5245
 *
 * - "host" — локальный IP адрес
 * - "srflx" — Server Reflexive (NAT mapped)
 * - "prflx" — Peer Reflexive
 * - "relay" — TURN relay (промежуточный сервер)
 * - "unknown" — других или неизвестный тип
 *
 * @see https://tools.ietf.org/html/rfc5245#section-4.1.1.1
 */
export type IceCandidateType = "host" | "srflx" | "prflx" | "relay" | "unknown";

/**
 * Результат анализа выбранной ICE пары.
 *
 * @property pairId - Уникальный ID пары кандидатов (из transport.selectedCandidatePairId)
 * @property localCandidateType - Тип локального кандидата (обычно интересует relay для диагностики)
 * @property remoteCandidateType - Тип удалённого кандидата
 * @property localCandidateId - ID локального кандидата (для доп. исследований)
 * @property remoteCandidateId - ID удалённого кандидата
 */
export interface SelectedIcePair {
  pairId: string;
  localCandidateType: IceCandidateType;
  remoteCandidateType: IceCandidateType;
  localCandidateId?: string;
  remoteCandidateId?: string;
}

/**
 * Момент времени с информацией о relay использовании.
 *
 * @property timestamp - Время сбора метрики (ms since epoch)
 * @property isRelaySelected - Используется ли TURN relay для этой пары
 * @property localCandidateType - Тип локального кандидата
 * @property remoteCandidateType - Тип удалённого кандидата
 * @property pairId - ID выбранной пары
 * @property bytesReceived - Байт получено через эту пару (если доступно)
 * @property bytesSent - Байт отправлено через эту пару (если доступно)
 */
export interface RelaySelectionEvent {
  timestamp: number;
  isRelaySelected: boolean;
  localCandidateType: IceCandidateType;
  remoteCandidateType: IceCandidateType;
  pairId: string;
  bytesReceived?: number;
  bytesSent?: number;
}

type AnyStats = Record<string, unknown>;

/**
 * Flexible stats container type — supports RTCStatsReport-like objects.
 *
 * - Iterable<[string, AnyStats]> — raw iterator (RTCStatsReport API)
 * - Map<string, AnyStats> — Map instance (for unit tests)
 * - forEach callback — custom iterator
 */
type StatsLike =
  | Iterable<[string, AnyStats]>
  | Map<string, AnyStats>
  | { forEach: (callback: (value: AnyStats, key: string) => void) => void };

/**
 * Normalize candidate type string to standardized IceCandidateType.
 *
 * Handles case-insensitivity and unknown values gracefully.
 *
 * @param value - Raw candidateType value from RTCStats
 * @returns Normalized IceCandidateType or "unknown"
 */
function normalizeCandidateType(value: unknown): IceCandidateType {
  const raw = typeof value === "string" ? value.toLowerCase().trim() : "";
  if (raw === "host" || raw === "srflx" || raw === "prflx" || raw === "relay") {
    return raw;
  }
  return "unknown";
}

/**
 * Convert StatsLike to standard [key, value] array format.
 *
 * Handles:
 * - Map instances
 * - forEach callback objects
 * - Raw iterables
 * - null/undefined (returns empty array with warning)
 *
 * @param stats - StatsLike stats container
 * @returns Array of [key, stat] tuples
 */
function toEntries(stats: StatsLike | null | undefined): Array<[string, AnyStats]> {
  if (!stats) {
    logger.debug("[relayStats] toEntries called with null/undefined stats");
    return [];
  }

  if (stats instanceof Map) {
    return Array.from(stats.entries());
  }

  if (typeof (stats as { forEach?: unknown }).forEach === "function") {
    const out: Array<[string, AnyStats]> = [];
    try {
      (stats as { forEach: (callback: (value: AnyStats, key: string) => void) => void }).forEach(
        (value, key) => out.push([key, value]),
      );
    } catch (error) {
      logger.warn("[relayStats] forEach iteration failed", error);
      return [];
    }
    return out;
  }

  try {
    return Array.from(stats as Iterable<[string, AnyStats]>);
  } catch (error) {
    logger.error("[relayStats] toEntries failed to iterate stats", error);
    return [];
  }
}


/**
 * Extract selected ICE candidate pair from a RTCStatsReport-like container.
 *
 * Works with WebRTC stats snapshots from browser APIs and unit-test maps.
 * Uses two fallback strategies:
 * 1. Read transport.selectedCandidatePairId (primary)
 * 2. Find nominated/succeeded candidate-pair (fallback)
 *
 * @param stats - StatsLike stats container (RTCStatsReport, Map, forEach callback)
 * @returns SelectedIcePair describing selected candidate pair, or null if not found
 *
 * @example
 * ```typescript
 * const stats = await peerConnection.getStats();
 * const pair = extractSelectedIcePair(stats);
 * if (pair?.localCandidateType === "relay") {
 *   console.log("Using TURN relay");
 * }
 * ```
 */
export function extractSelectedIcePair(stats: StatsLike | null | undefined): SelectedIcePair | null {
  const entries = toEntries(stats);
  if (entries.length === 0) {
    logger.debug("[relayStats] extractSelectedIcePair: no entries in stats");
    return null;
  }

  const byId = new Map<string, AnyStats>(entries);

  // Strategy 1: Use transport.selectedCandidatePairId
  let selectedPairId: string | null = null;
  for (const [, item] of entries) {
    if ((item as AnyStats).type === "transport") {
      const candidatePairId = (item as AnyStats).selectedCandidatePairId;
      if (typeof candidatePairId === "string" && candidatePairId) {
        selectedPairId = candidatePairId;
        logger.debug("[relayStats] Found selected pair via transport", { pairId: selectedPairId });
        break;
      }
    }
  }

  // Strategy 2: Fallback to nominated/succeeded candidate pair
  if (!selectedPairId) {
    logger.debug("[relayStats] No transport selectedCandidatePairId, falling back to nominated pair");
    for (const [id, item] of entries) {
      if ((item as AnyStats).type !== "candidate-pair") continue;
      const state = String((item as AnyStats).state ?? "").toLowerCase().trim();
      const nominated = (item as AnyStats).nominated === true;
      const selected = (item as AnyStats).selected === true;
      if (selected || (nominated && state === "succeeded")) {
        selectedPairId = id;
        logger.debug("[relayStats] Found selected pair via nominated+succeeded", { pairId: selectedPairId });
        break;
      }
    }
  }

  if (!selectedPairId) {
    logger.debug("[relayStats] extractSelectedIcePair: no selected pair found after all strategies");
    return null;
  }

  const pair = byId.get(selectedPairId);
  if (!pair || pair.type !== "candidate-pair") {
    logger.warn("[relayStats] Selected pair ID not found or not candidate-pair type", { selectedPairId });
    return null;
  }

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
 * Gate helper: determine if call is using TURN relay.
 *
 * Returns true ONLY when selected local candidate is explicitly "relay" type.
 * - host/srflx/prflx → false (P2P)
 * - relay → true (TURN relay, likely due to NAT/firewall constraints)
 * - unknown/null → false
 *
 * @param stats - StatsLike stats container
 * @returns true if relay is selected, false otherwise
 *
 * @example
 * ```typescript
 * const stats = await peerConnection.getStats();
 * if (isRelaySelected(stats)) {
 *   console.log("Call routed through TURN relay (NAT/firewall detected)");
 * }
 * ```
 */
export function isRelaySelected(stats: StatsLike | null | undefined): boolean {
  const selected = extractSelectedIcePair(stats);
  return selected?.localCandidateType === "relay";
}

/**
 * Extract full relay metrics including bandwidth data for monitoring.
 *
 * Combines candidate pair selection with bandwidth metrics for comprehensive
 * relay monitoring and diagnostics.
 *
 * @param stats - StatsLike stats container (RTCStatsReport, Map, etc.)
 * @returns RelaySelectionEvent with timestamp and bandwidth data, or null if pair not found
 *
 * @example
 * ```typescript
 * const metrics = extractRelayMetrics(stats);
 * if (metrics?.isRelaySelected) {
 *   console.log(`Bytes over relay: ${metrics.bytesReceived} / ${metrics.bytesSent}`);
 * }
 * ```
 */
export function extractRelayMetrics(stats: StatsLike | null | undefined): RelaySelectionEvent | null {
  const selected = extractSelectedIcePair(stats);
  if (!selected) {
    logger.debug("[relayStats] extractRelayMetrics: no selected pair found");
    return null;
  }

  const isRelay = selected.localCandidateType === "relay";
  const entries = toEntries(stats);
  const byId = new Map(entries);
  const pair = byId.get(selected.pairId) as AnyStats | undefined;

  const event: RelaySelectionEvent = {
    timestamp: Date.now(),
    isRelaySelected: isRelay,
    localCandidateType: selected.localCandidateType,
    remoteCandidateType: selected.remoteCandidateType,
    pairId: selected.pairId,
    bytesReceived: typeof pair?.bytesReceived === "number" ? pair.bytesReceived : undefined,
    bytesSent: typeof pair?.bytesSent === "number" ? pair.bytesSent : undefined,
  };

  logger.debug("[relayStats] Relay metrics extracted", {
    isRelay,
    bytes: { received: event.bytesReceived, sent: event.bytesSent },
  });

  return event;
}

/**
 * Public API for RelayStatsCollector configuration.
 */
export interface RelayStatsCollectorConfig {
  /** Maximum number of samples to retain in history (default: 100) */
  maxHistorySize?: number;
  /** Enable debug logging (default: false) */
  debug?: boolean;
}

/**
 * Public API for RelayStatsCollector metrics output.
 */
export interface RelayMetrics {
  /** Percentage of samples that used relay (0-1) */
  relay_usage_rate: number;
  /** Number of times relay fallback was triggered */
  relay_fallback_count: number;
  /** Total number of samples collected */
  total_samples: number;
  /** Time elapsed since collector creation (ms) */
  uptime_ms: number;
  /** Average bytes routed over relay across all samples */
  avg_bytes_over_relay: number;
  /** Timestamp of last traffic over relay (ms since epoch) */
  last_relay_timestamp_ms?: number;
}

/**
 * Collector for relay statistics over a call session.
 *
 * Tracks relay usage patterns, fallback events, and bandwidth metrics.
 *
 * @example
 * ```typescript
 * const collector = new RelayStatsCollector({ maxHistorySize: 50 });
 *
 * // Periodically (e.g., every 1 second)
 * const stats = await peerConnection.getStats();
 * const event = extractRelayMetrics(stats);
 * if (event) {
 *   collector.recordSample(event);
 * }
 *
 * // Later: retrieve metrics
 * const metrics = collector.getMetrics();
 * console.log(`Call used relay ${(metrics.relay_usage_rate * 100).toFixed(1)}% of the time`);
 * ```
 */
export class RelayStatsCollector {
  private samples: RelaySelectionEvent[] = [];
  private readonly maxHistorySize: number;
  private readonly debug: boolean;
  private startTime = Date.now();
  private fallbackCount = 0;
  private previousWasRelay = false;

  constructor(config?: RelayStatsCollectorConfig) {
    this.maxHistorySize = config?.maxHistorySize ?? 100;
    this.debug = config?.debug ?? false;
    if (this.debug) {
      logger.debug("[RelayStatsCollector] Created", { maxHistorySize: this.maxHistorySize });
    }
  }

  /**
   * Record a relay selection event (typically every 1-5 seconds during a call).
   *
   * Automatically detects relay fallback transitions and logs transitions.
   *
   * @param event - RelaySelectionEvent from extractRelayMetrics()
   */
  recordSample(event: RelaySelectionEvent): void {
    // Detect relay fallback: transition from P2P to relay
    if (event.isRelaySelected && !this.previousWasRelay) {
      this.fallbackCount++;
      logger.info("[RelayStatsCollector] RELAY FALLBACK detected", {
        fallbackCount: this.fallbackCount,
        uptime_ms: Date.now() - this.startTime,
        bytes: { received: event.bytesReceived, sent: event.bytesSent },
      });
    }

    this.samples.push(event);
    this.previousWasRelay = event.isRelaySelected;

    // Trim old samples to stay within memory bounds
    if (this.samples.length > this.maxHistorySize) {
      this.samples.shift();
    }

    if (this.debug && this.samples.length % 10 === 0) {
      logger.debug("[RelayStatsCollector] Sample recorded", {
        total: this.samples.length,
        isRelay: event.isRelaySelected,
      });
    }
  }

  /**
   * Get relay usage rate (0-1).
   *
   * Percentage of samples where relay was selected.
   *
   * @returns relay_usage_rate: 0 = all P2P, 1 = all relay
   */
  getRelayUsageRate(): number {
    if (this.samples.length === 0) return 0;
    const relayCount = this.samples.filter((s) => s.isRelaySelected).length;
    return relayCount / this.samples.length;
  }

  /**
   * Get number of times relay fallback was triggered.
   *
   * A "fallback" is a transition from P2P to relay (typically due to ICE restart).
   *
   * @returns Fallback count (0 = stayed P2P entire call)
   */
  getFallbackCount(): number {
    return this.fallbackCount;
  }

  /**
   * Get aggregated relay metrics for reporting.
   *
   * @returns RelayMetrics object with all key metrics
   */
  getMetrics(): RelayMetrics {
    const relayCount = this.samples.filter((s) => s.isRelaySelected).length;
    const totalBytes = this.samples.reduce((sum, s) => sum + (s.bytesSent ?? 0) + (s.bytesReceived ?? 0), 0);
    let lastRelayTimestamp: number | undefined;
    for (let i = this.samples.length - 1; i >= 0; i--) {
      if (this.samples[i].isRelaySelected) {
        lastRelayTimestamp = this.samples[i].timestamp;
        break;
      }
    }

    return {
      relay_usage_rate: this.getRelayUsageRate(),
      relay_fallback_count: this.fallbackCount,
      total_samples: this.samples.length,
      uptime_ms: Date.now() - this.startTime,
      avg_bytes_over_relay: this.samples.length > 0 ? totalBytes / this.samples.length : 0,
      last_relay_timestamp_ms: lastRelayTimestamp,
    };
  }

  /**
   * Get raw sample history (for advanced diagnostics).
   *
   * @returns Copy of sample history array
   */
  getSamples(): RelaySelectionEvent[] {
    return [...this.samples];
  }

  /**
   * Reset collector state (e.g., for new call).
   */
  reset(): void {
    this.samples = [];
    this.startTime = Date.now();
    this.fallbackCount = 0;
    this.previousWasRelay = false;
    logger.debug("[RelayStatsCollector] Reset");
  }
}
