import { describe, expect, it } from "vitest";
import {
  extractSelectedIcePair,
  isRelaySelected,
  extractRelayMetrics,
  RelayStatsCollector,
} from "@/calls-v2/relayStats";

describe("calls-v2 relay candidate selection", () => {
  it("detects relay when transport selectedCandidatePairId points to relay local candidate", () => {
    const stats = new Map<string, Record<string, unknown>>([
      ["transport-1", { type: "transport", selectedCandidatePairId: "pair-1" }],
      [
        "pair-1",
        {
          id: "pair-1",
          type: "candidate-pair",
          state: "succeeded",
          nominated: true,
          localCandidateId: "local-1",
          remoteCandidateId: "remote-1",
        },
      ],
      ["local-1", { id: "local-1", type: "local-candidate", candidateType: "relay" }],
      ["remote-1", { id: "remote-1", type: "remote-candidate", candidateType: "srflx" }],
    ]);

    const selected = extractSelectedIcePair(stats);
    expect(selected).not.toBeNull();
    expect(selected?.pairId).toBe("pair-1");
    expect(selected?.localCandidateType).toBe("relay");
    expect(isRelaySelected(stats)).toBe(true);
  });

  it("returns false when selected pair is host/srflx and not relay", () => {
    const stats = new Map<string, Record<string, unknown>>([
      ["transport-1", { type: "transport", selectedCandidatePairId: "pair-2" }],
      [
        "pair-2",
        {
          id: "pair-2",
          type: "candidate-pair",
          state: "succeeded",
          nominated: true,
          localCandidateId: "local-2",
          remoteCandidateId: "remote-2",
        },
      ],
      ["local-2", { id: "local-2", type: "local-candidate", candidateType: "host" }],
      ["remote-2", { id: "remote-2", type: "remote-candidate", candidateType: "srflx" }],
    ]);

    expect(isRelaySelected(stats)).toBe(false);
  });

  it("falls back to nominated+succeeded candidate pair when transport stats are absent", () => {
    const stats = new Map<string, Record<string, unknown>>([
      [
        "pair-3",
        {
          id: "pair-3",
          type: "candidate-pair",
          state: "succeeded",
          nominated: true,
          localCandidateId: "local-3",
          remoteCandidateId: "remote-3",
        },
      ],
      ["local-3", { id: "local-3", type: "local-candidate", candidateType: "relay" }],
      ["remote-3", { id: "remote-3", type: "remote-candidate", candidateType: "host" }],
    ]);

    const selected = extractSelectedIcePair(stats);
    expect(selected?.pairId).toBe("pair-3");
    expect(selected?.localCandidateType).toBe("relay");
    expect(isRelaySelected(stats)).toBe(true);
  });

  it("returns null/false when selected pair cannot be determined", () => {
    const stats = new Map<string, Record<string, unknown>>([
      ["local-1", { id: "local-1", type: "local-candidate", candidateType: "relay" }],
    ]);

    expect(extractSelectedIcePair(stats)).toBeNull();
    expect(isRelaySelected(stats)).toBe(false);
  });

  it("handles null/undefined stats gracefully", () => {
    expect(extractSelectedIcePair(null)).toBeNull();
    expect(extractSelectedIcePair(undefined)).toBeNull();
    expect(isRelaySelected(null)).toBe(false);
    expect(isRelaySelected(undefined)).toBe(false);
  });

  it("handles empty stats map", () => {
    const stats = new Map<string, Record<string, unknown>>();
    expect(extractSelectedIcePair(stats)).toBeNull();
    expect(isRelaySelected(stats)).toBe(false);
  });

  it("normalizes candidate type case-insensitively", () => {
    const stats = new Map<string, Record<string, unknown>>([
      ["transport-1", { type: "transport", selectedCandidatePairId: "pair-1" }],
      [
        "pair-1",
        {
          id: "pair-1",
          type: "candidate-pair",
          localCandidateId: "local-1",
          remoteCandidateId: "remote-1",
        },
      ],
      ["local-1", { id: "local-1", type: "local-candidate", candidateType: "RELAY" }],
      ["remote-1", { id: "remote-1", type: "remote-candidate", candidateType: "SrFlx" }],
    ]);

    const selected = extractSelectedIcePair(stats);
    expect(selected?.localCandidateType).toBe("relay");
    expect(selected?.remoteCandidateType).toBe("srflx");
  });
});

describe("calls-v2 relay metrics collection", () => {
  it("extracts relay metrics with bandwidth data", () => {
    const stats = new Map<string, Record<string, unknown>>([
      ["transport-1", { type: "transport", selectedCandidatePairId: "pair-1" }],
      [
        "pair-1",
        {
          id: "pair-1",
          type: "candidate-pair",
          localCandidateId: "local-1",
          remoteCandidateId: "remote-1",
          bytesReceived: 1024000,
          bytesSent: 512000,
        },
      ],
      ["local-1", { id: "local-1", type: "local-candidate", candidateType: "relay" }],
      ["remote-1", { id: "remote-1", type: "remote-candidate", candidateType: "host" }],
    ]);

    const metrics = extractRelayMetrics(stats);
    expect(metrics).not.toBeNull();
    expect(metrics?.isRelaySelected).toBe(true);
    expect(metrics?.bytesReceived).toBe(1024000);
    expect(metrics?.bytesSent).toBe(512000);
    expect(metrics?.timestamp).toBeGreaterThan(0);
  });

  it("extracts relay metrics for P2P connection (no relay)", () => {
    const stats = new Map<string, Record<string, unknown>>([
      ["transport-1", { type: "transport", selectedCandidatePairId: "pair-1" }],
      [
        "pair-1",
        {
          id: "pair-1",
          type: "candidate-pair",
          localCandidateId: "local-1",
          remoteCandidateId: "remote-1",
          bytesReceived: 2048000,
          bytesSent: 1024000,
        },
      ],
      ["local-1", { id: "local-1", type: "local-candidate", candidateType: "host" }],
      ["remote-1", { id: "remote-1", type: "remote-candidate", candidateType: "srflx" }],
    ]);

    const metrics = extractRelayMetrics(stats);
    expect(metrics).not.toBeNull();
    expect(metrics?.isRelaySelected).toBe(false);
    expect(metrics?.bytesReceived).toBe(2048000);
  });

  it("handles missing bandwidth data in metrics", () => {
    const stats = new Map<string, Record<string, unknown>>([
      ["transport-1", { type: "transport", selectedCandidatePairId: "pair-1" }],
      [
        "pair-1",
        {
          id: "pair-1",
          type: "candidate-pair",
          localCandidateId: "local-1",
          remoteCandidateId: "remote-1",
        },
      ],
      ["local-1", { id: "local-1", type: "local-candidate", candidateType: "relay" }],
      ["remote-1", { id: "remote-1", type: "remote-candidate", candidateType: "host" }],
    ]);

    const metrics = extractRelayMetrics(stats);
    expect(metrics).not.toBeNull();
    expect(metrics?.bytesReceived).toBeUndefined();
    expect(metrics?.bytesSent).toBeUndefined();
  });
});

describe("calls-v2 RelayStatsCollector", () => {
  it("tracks relay usage rate", () => {
    const collector = new RelayStatsCollector({ maxHistorySize: 10 });

    // Record 3 samples: 2 relay, 1 P2P
    collector.recordSample({
      timestamp: Date.now(),
      isRelaySelected: true,
      localCandidateType: "relay",
      remoteCandidateType: "host",
      pairId: "pair-1",
    });

    collector.recordSample({
      timestamp: Date.now(),
      isRelaySelected: true,
      localCandidateType: "relay",
      remoteCandidateType: "host",
      pairId: "pair-1",
    });

    collector.recordSample({
      timestamp: Date.now(),
      isRelaySelected: false,
      localCandidateType: "host",
      remoteCandidateType: "srflx",
      pairId: "pair-2",
    });

    const metrics = collector.getMetrics();
    expect(metrics.relay_usage_rate).toBeCloseTo(2 / 3, 2);
    expect(metrics.total_samples).toBe(3);
  });

  it("detects relay fallback transitions", () => {
    const collector = new RelayStatsCollector();

    // Start with P2P
    collector.recordSample({
      timestamp: Date.now(),
      isRelaySelected: false,
      localCandidateType: "host",
      remoteCandidateType: "srflx",
      pairId: "pair-1",
    });

    // Fallback to relay (first transition)
    collector.recordSample({
      timestamp: Date.now(),
      isRelaySelected: true,
      localCandidateType: "relay",
      remoteCandidateType: "host",
      pairId: "pair-2",
    });

    // Stay on relay
    collector.recordSample({
      timestamp: Date.now(),
      isRelaySelected: true,
      localCandidateType: "relay",
      remoteCandidateType: "host",
      pairId: "pair-2",
    });

    const metrics = collector.getMetrics();
    expect(metrics.relay_fallback_count).toBe(1);
  });

  it("computes average bytes over relay", () => {
    const collector = new RelayStatsCollector();

    collector.recordSample({
      timestamp: Date.now(),
      isRelaySelected: true,
      localCandidateType: "relay",
      remoteCandidateType: "host",
      pairId: "pair-1",
      bytesSent: 1000,
      bytesReceived: 2000,
    });

    collector.recordSample({
      timestamp: Date.now(),
      isRelaySelected: true,
      localCandidateType: "relay",
      remoteCandidateType: "host",
      pairId: "pair-1",
      bytesSent: 2000,
      bytesReceived: 4000,
    });

    const metrics = collector.getMetrics();
    // (1000+2000 + 2000+4000) / 2 = 4500
    expect(metrics.avg_bytes_over_relay).toBeCloseTo(4500, 1);
  });

  it("respects maxHistorySize limit", () => {
    const collector = new RelayStatsCollector({ maxHistorySize: 5 });

    for (let i = 0; i < 10; i++) {
      collector.recordSample({
        timestamp: Date.now(),
        isRelaySelected: i % 2 === 0,
        localCandidateType: i % 2 === 0 ? "relay" : "host",
        remoteCandidateType: "host",
        pairId: "pair-1",
      });
    }

    const samples = collector.getSamples();
    expect(samples.length).toBe(5); // capped at maxHistorySize
  });

  it("tracks last relay timestamp", () => {
    const collector = new RelayStatsCollector();
    const now1 = Date.now();

    collector.recordSample({
      timestamp: now1,
      isRelaySelected: true,
      localCandidateType: "relay",
      remoteCandidateType: "host",
      pairId: "pair-1",
    });

    // Sleep a bit and record P2P
    const now2 = Date.now() + 100;
    collector.recordSample({
      timestamp: now2,
      isRelaySelected: false,
      localCandidateType: "host",
      remoteCandidateType: "srflx",
      pairId: "pair-2",
    });

    const metrics = collector.getMetrics();
    expect(metrics.last_relay_timestamp_ms).toBe(now1);
  });

  it("resets collector state", () => {
    const collector = new RelayStatsCollector();

    collector.recordSample({
      timestamp: Date.now(),
      isRelaySelected: true,
      localCandidateType: "relay",
      remoteCandidateType: "host",
      pairId: "pair-1",
    });

    expect(collector.getMetrics().total_samples).toBe(1);
    collector.reset();
    expect(collector.getMetrics().total_samples).toBe(0);
  });

  it("handles empty collector metrics", () => {
    const collector = new RelayStatsCollector();
    const metrics = collector.getMetrics();

    expect(metrics.relay_usage_rate).toBe(0);
    expect(metrics.relay_fallback_count).toBe(0);
    expect(metrics.total_samples).toBe(0);
    expect(metrics.avg_bytes_over_relay).toBe(0);
  });
});
