import { describe, expect, it } from "vitest";

import { resolveLocalProducerIdForTrack } from "@/contexts/video-call/resolveLocalProducerId";

describe("resolveLocalProducerIdForTrack", () => {
  it("uses producer id from actual track kind", () => {
    const result = resolveLocalProducerIdForTrack({
      declaredKind: "video",
      trackKind: "audio",
      localProducerIds: {
        audio: "audio-producer",
        video: "video-producer",
      },
      getProducerKind: (producerId) => (producerId === "audio-producer" ? "audio" : "video"),
    });

    expect(result).toEqual({
      producerId: "audio-producer",
      resolvedKind: "audio",
      usedFallbackKind: false,
    });
  });

  it("never returns producer with mismatched kind", () => {
    const result = resolveLocalProducerIdForTrack({
      declaredKind: "audio",
      trackKind: "audio",
      localProducerIds: {
        audio: "video-producer",
        video: "audio-producer",
      },
      getProducerKind: (producerId) => (producerId === "audio-producer" ? "audio" : "video"),
    });

    expect(result).toEqual({
      producerId: null,
      resolvedKind: "audio",
      usedFallbackKind: false,
    });
  });

  it("uses declared kind as fallback when track kind is unknown", () => {
    const result = resolveLocalProducerIdForTrack({
      declaredKind: "video",
      trackKind: "screen",
      localProducerIds: {
        audio: "audio-producer",
        video: "video-producer",
      },
      getProducerKind: (producerId) => (producerId === "audio-producer" ? "audio" : "video"),
    });

    expect(result).toEqual({
      producerId: "video-producer",
      resolvedKind: "video",
      usedFallbackKind: false,
    });
  });
});
