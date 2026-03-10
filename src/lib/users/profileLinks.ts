const DEFAULT_PROFILE_ORIGIN = "https://mansoni.ru";

function normalizeProfilePart(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/^@+/, "");
}

export function getCanonicalProfileSlug(input: { username?: unknown; userId?: unknown }): string {
  const username = normalizeProfilePart(input.username);
  if (username) return username;

  const userId = normalizeProfilePart(input.userId);
  if (userId) return userId;

  throw new Error("PROFILE_SLUG_MISSING");
}

export function buildProfilePath(input: { username?: unknown; userId?: unknown }): string {
  const slug = getCanonicalProfileSlug(input);
  return `/user/${encodeURIComponent(slug)}`;
}

export function buildProfileUrl(
  input: { username?: unknown; userId?: unknown },
  options?: { origin?: string | null },
): string {
  const origin = normalizeProfilePart(options?.origin).replace(/\/+$/, "") || DEFAULT_PROFILE_ORIGIN;
  return `${origin}${buildProfilePath(input)}`;
}