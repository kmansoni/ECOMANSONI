type LocalProducerKind = "audio" | "video";

type ProducerKindGetter = (producerId: string) => LocalProducerKind | null;

interface ResolveLocalProducerIdInput {
  declaredKind: LocalProducerKind;
  trackKind: string;
  localProducerIds: { audio: string | null; video: string | null };
  getProducerKind: ProducerKindGetter;
}

export interface ResolveLocalProducerIdResult {
  producerId: string | null;
  resolvedKind: LocalProducerKind;
  usedFallbackKind: boolean;
}

function toLocalProducerKind(value: string, fallback: LocalProducerKind): LocalProducerKind {
  if (value === "audio" || value === "video") return value;
  return fallback;
}

/**
 * Resolve producer id for local track replacement.
 * Priority: actual MediaStreamTrack.kind, then declared callback kind.
 * Safety: never return producer id whose current producer kind mismatches expected kind.
 */
export function resolveLocalProducerIdForTrack(input: ResolveLocalProducerIdInput): ResolveLocalProducerIdResult {
  const resolvedKind = toLocalProducerKind(input.trackKind, input.declaredKind);

  const primaryId = input.localProducerIds[resolvedKind];
  if (primaryId) {
    const primaryKind = input.getProducerKind(primaryId);
    if (primaryKind === resolvedKind) {
      return {
        producerId: primaryId,
        resolvedKind,
        usedFallbackKind: false,
      };
    }
  }

  const fallbackKind = input.declaredKind;
  if (fallbackKind !== resolvedKind) {
    const fallbackId = input.localProducerIds[fallbackKind];
    if (fallbackId) {
      const fallbackProducerKind = input.getProducerKind(fallbackId);
      if (fallbackProducerKind === resolvedKind) {
        return {
          producerId: fallbackId,
          resolvedKind,
          usedFallbackKind: true,
        };
      }
    }
  }

  return {
    producerId: null,
    resolvedKind,
    usedFallbackKind: false,
  };
}
