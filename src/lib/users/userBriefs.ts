import { supabase } from "@/lib/supabase";

export interface UserBrief {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  username: string;
}

export interface UserBriefLike {
  display_name?: string | null;
  avatar_url?: string | null;
  full_name?: string | null;
  username?: string | null;
}

type QueryResult = Promise<{ data: unknown; error: unknown }>;

export interface UserBriefClient {
  rpc: (fn: string, args?: Record<string, unknown>) => QueryResult;
  from: (table: "profiles") => {
    select: (columns: string) => {
      in: (column: string, values: string[]) => QueryResult;
    };
  };
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function makeFallbackToken(userId: string, size: number): string {
  return `u_${userId.replace(/-/g, "").slice(0, size)}`;
}

export function makeFallbackUserBrief(userId: string): UserBrief {
  const displayToken = makeFallbackToken(userId, 8);
  return {
    user_id: userId,
    display_name: displayToken,
    avatar_url: null,
    username: makeFallbackToken(userId, 16),
  };
}

function toUserBrief(userId: string, source?: UserBriefLike | null): UserBrief {
  const fallback = makeFallbackUserBrief(userId);
  return {
    user_id: userId,
    display_name:
      normalizeText(source?.display_name) ??
      normalizeText(source?.full_name) ??
      fallback.display_name,
    avatar_url: normalizeText(source?.avatar_url),
    username: normalizeText(source?.username) ?? fallback.username,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function warnUserBriefs(message: string, error: unknown): void {
  if (!import.meta.env.DEV) return;
  if (import.meta.env.MODE === "test") return;
  console.warn(message, error);
}

async function fetchProfilesFallback(
  userIds: string[],
  client: UserBriefClient,
  briefMap: Map<string, UserBrief>
): Promise<void> {
  if (userIds.length === 0) return;

  const { data, error } = await client
    .from("profiles")
    .select("user_id, display_name, avatar_url, username, full_name")
    .in("user_id", userIds);

  if (error) {
    throw error;
  }

  for (const row of Array.isArray(data) ? data : []) {
    if (!isObject(row)) continue;
    const userId = normalizeText(row.user_id);
    if (!userId) continue;
    briefMap.set(userId, toUserBrief(userId, row));
  }
}

export async function fetchUserBriefMap(
  userIds: string[],
  client: UserBriefClient = supabase as unknown as UserBriefClient
): Promise<Map<string, UserBrief>> {
  const uniqueUserIds = [...new Set(userIds.map((userId) => normalizeText(userId)).filter(Boolean))] as string[];
  const briefMap = new Map<string, UserBrief>();

  if (uniqueUserIds.length === 0) {
    return briefMap;
  }

  try {
    const { data, error } = await client.rpc("get_user_briefs", {
      p_user_ids: uniqueUserIds,
    });

    if (error) {
      throw error;
    }

    for (const row of Array.isArray(data) ? data : []) {
      if (!isObject(row)) continue;
      const userId = normalizeText(row.user_id);
      if (!userId) continue;
      briefMap.set(userId, toUserBrief(userId, row));
    }
  } catch (error) {
    warnUserBriefs("[user-briefs] get_user_briefs RPC failed, falling back to profiles", error);
  }

  const missingUserIds = uniqueUserIds.filter((userId) => !briefMap.has(userId));
  if (missingUserIds.length > 0) {
    try {
      await fetchProfilesFallback(missingUserIds, client, briefMap);
    } catch (error) {
      warnUserBriefs("[user-briefs] profiles fallback failed", error);
    }
  }

  for (const userId of uniqueUserIds) {
    if (!briefMap.has(userId)) {
      briefMap.set(userId, makeFallbackUserBrief(userId));
    }
  }

  return briefMap;
}

export function resolveUserBrief(
  userId: string | null | undefined,
  briefMap: ReadonlyMap<string, UserBrief>,
  embedded?: UserBriefLike | null
): UserBrief | undefined {
  const normalizedUserId = normalizeText(userId);
  if (!normalizedUserId) return undefined;

  return briefMap.get(normalizedUserId) ?? toUserBrief(normalizedUserId, embedded);
}