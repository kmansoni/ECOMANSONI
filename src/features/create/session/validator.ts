import type { CreateSession } from "./types";

export type CreateValidationReason =
  | "LIVE_NOT_READY"
  | "NO_ASSETS"
  | "TOO_MANY_ASSETS"
  | "STORY_SINGLE_ONLY"
  | "REELS_VIDEO_ONLY"
  | "REELS_LOCAL_FILE_REQUIRED";

export interface CreateValidationResult {
  ok: boolean;
  reasons: CreateValidationReason[];
}

export function validateCreateSession(session: CreateSession): CreateValidationResult {
  const reasons: CreateValidationReason[] = [];

  if (session.mode === "live") {
    reasons.push("LIVE_NOT_READY");
  }

  if (session.mode !== "live" && session.assets.length === 0) {
    reasons.push("NO_ASSETS");
  }

  if (session.mode === "post" && session.assets.length > 10) {
    reasons.push("TOO_MANY_ASSETS");
  }

  if (session.mode === "story" && session.assets.length > 1) {
    reasons.push("STORY_SINGLE_ONLY");
  }

  if (session.mode === "reels") {
    const first = session.assets[0];
    if (session.assets.length > 1) reasons.push("TOO_MANY_ASSETS");
    if (first && first.kind !== "video") reasons.push("REELS_VIDEO_ONLY");
    if (first && !first.localFile) reasons.push("REELS_LOCAL_FILE_REQUIRED");
  }

  return {
    ok: reasons.length === 0,
    reasons,
  };
}