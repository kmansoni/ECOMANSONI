import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import type { Channel } from "@/hooks/useChannels";
import {
  canCapability,
  checkChannelCapabilityViaRpc,
  fetchChannelCapabilityCatalog,
  fetchChannelCapabilityOverrides,
  fetchChannelRoleCapabilities,
  resolveCapabilities,
  upsertChannelCapabilityOverride,
  type ChannelCapability,
  type ChannelCapabilityOverride,
  type ChannelRole,
  type ResolvedCapability,
} from "@/lib/channel-capabilities";

function resolveUserRoleInChannel(channel: Channel, userId?: string): ChannelRole {
  if (!userId) return "guest";
  if (channel.owner_id === userId) return "owner";
  const memberRole = String((channel as any)?.member_role ?? "").toLowerCase();
  if (memberRole === "admin") return "admin";
  if (channel.is_member) return "member";
  return "guest";
}

function isSchemaMissingError(error: unknown): boolean {
  const msg = String((error as any)?.message ?? error).toLowerCase();
  const code = String((error as any)?.code ?? "");
  return (
    code === "42P01" ||
    code === "42883" ||
    msg.includes("does not exist") ||
    msg.includes("function") ||
    msg.includes("relation")
  );
}

function legacyResolvedByRole(role: ChannelRole): Record<string, ResolvedCapability> {
  const base: Record<string, ResolvedCapability> = {
    "channel.posts.read": { key: "channel.posts.read", enabled: true, source: "role" },
    "channel.posts.create": {
      key: "channel.posts.create",
      enabled: role !== "guest",
      source: "role",
    },
    "channel.members.invite": {
      key: "channel.members.invite",
      enabled: role === "owner" || role === "admin",
      source: "role",
    },
  };
  return base;
}

export function useChannelCapabilities(channel: Channel | null) {
  const { user } = useAuth();
  const [catalog, setCatalog] = useState<ChannelCapability[]>([]);
  const [overrides, setOverrides] = useState<ChannelCapabilityOverride[]>([]);
  const [resolvedMap, setResolvedMap] = useState<Record<string, ResolvedCapability>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const role = useMemo<ChannelRole>(() => {
    if (!channel) return "guest";
    return resolveUserRoleInChannel(channel, user?.id);
  }, [channel, user?.id]);

  const refetch = useCallback(async () => {
    if (!channel) {
      setCatalog([]);
      setOverrides([]);
      setResolvedMap({});
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [catalogRows, roleRows, overrideRows] = await Promise.all([
        fetchChannelCapabilityCatalog(),
        fetchChannelRoleCapabilities(role),
        fetchChannelCapabilityOverrides(channel.id),
      ]);

      const resolved = resolveCapabilities({
        role,
        roleCapabilities: roleRows,
        overrides: overrideRows,
      });

      setCatalog(catalogRows);
      setOverrides(overrideRows);
      setResolvedMap(resolved);
    } catch (err) {
      if (isSchemaMissingError(err)) {
        setResolvedMap(legacyResolvedByRole(role));
        setError(null);
      } else {
        setError(err instanceof Error ? err.message : "Failed to load channel capabilities");
      }
    } finally {
      setLoading(false);
    }
  }, [channel, role]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const can = useCallback(
    (capabilityKey: string) => canCapability(resolvedMap, capabilityKey),
    [resolvedMap],
  );

  const canRpc = useCallback(
    async (capabilityKey: string) => {
      if (!channel || !user) return false;
      try {
        return await checkChannelCapabilityViaRpc(channel.id, user.id, capabilityKey);
      } catch (err) {
        if (isSchemaMissingError(err)) {
          return can(capabilityKey);
        }
        throw err;
      }
    },
    [can, channel, user],
  );

  const setOverride = useCallback(
    async (capabilityKey: string, isEnabled: boolean, params?: Record<string, unknown>) => {
      if (!channel) return;
      await upsertChannelCapabilityOverride({
        channelId: channel.id,
        capabilityKey,
        isEnabled,
        params,
      });
      await refetch();
    },
    [channel, refetch],
  );

  return {
    role,
    catalog,
    overrides,
    resolvedMap,
    loading,
    error,
    can,
    canRpc,
    setOverride,
    refetch,
  };
}
