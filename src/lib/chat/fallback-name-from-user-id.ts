export function fallbackNameFromUserId(userId: string | null | undefined, fallback = "User"): string {
  const normalized = String(userId || "").trim();
  if (!normalized) return fallback;
  return normalized.slice(0, 8);
}