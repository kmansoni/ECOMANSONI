import { describe, expect, it } from "vitest";
import { extractSelectedIcePair, isRelaySelected } from "@/calls-v2/relayStats";

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
});
