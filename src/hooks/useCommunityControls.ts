import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  createChannelInviteToken,
  createGroupInviteToken,
  getOrCreateUserCommunitySettings,
  updateUserCommunitySettings,
  type UserCommunitySettings,
} from "@/lib/community-controls";

export function useCommunityGlobalSettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<UserCommunitySettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!user) {
      setSettings(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await getOrCreateUserCommunitySettings(user.id);
      setSettings(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load community settings");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const update = useCallback(
    async (patch: Partial<Omit<UserCommunitySettings, "user_id" | "created_at" | "updated_at">>) => {
      if (!user) throw new Error("Auth required");
      const data = await updateUserCommunitySettings(user.id, patch);
      setSettings(data);
      return data;
    },
    [user],
  );

  return { settings, loading, error, refetch, update };
}

export function useCommunityInvites() {
  const createChannelInvite = useCallback(async (channelId: string, maxUses?: number | null, ttlHours = 168) => {
    return createChannelInviteToken(channelId, maxUses, ttlHours);
  }, []);

  const createGroupInvite = useCallback(async (groupId: string, maxUses?: number | null, ttlHours = 168) => {
    return createGroupInviteToken(groupId, maxUses, ttlHours);
  }, []);

  return { createChannelInvite, createGroupInvite };
}

