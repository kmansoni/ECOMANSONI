import { normalizeMediaUrl } from "@/lib/mediaUrl";

export function normalizeReelMediaUrl(urlOrPath: unknown, bucket = "reels-media"): string {
  return normalizeMediaUrl(urlOrPath, bucket);
}