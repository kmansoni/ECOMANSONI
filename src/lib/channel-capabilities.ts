import { supabase } from "@/lib/supabase";

export type ChannelRole = "owner" | "admin" | "member" | "guest";

export interface ChannelCapability {
  key: string;
  domain: string;
  title: string;
  description: string | null;
  is_active: boolean;
  default_params: Record<string, unknown>;
}

export interface ChannelRoleCapability {
  role: ChannelRole;
  capability_key: string;
  is_allowed: boolean;
}

export interface ChannelCapabilityOverride {
  id: string;
  channel_id: string;
  capability_key: string;
  is_enabled: boolean;
  params: Record<string, unknown>;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ResolvedCapability {
  key: string;
  enabled: boolean;
  source: "override" | "role";
}

export interface CapabilityResolverInput {
  role: ChannelRole;
  roleCapabilities: ChannelRoleCapability[];
  overrides: Array<Pick<ChannelCapabilityOverride, "capability_key" | "is_enabled">>;
}

export function resolveCapabilities({
  role,
  roleCapabilities,
  overrides,
}: CapabilityResolverInput): Record<string, ResolvedCapability> {
  const resolved: Record<string, ResolvedCapability> = {};

  for (const rc of roleCapabilities) {
    if (rc.role !== role) continue;
    resolved[rc.capability_key] = {
      key: rc.capability_key,
      enabled: Boolean(rc.is_allowed),
      source: "role",
    };
  }

  for (const ov of overrides) {
    resolved[ov.capability_key] = {
      key: ov.capability_key,
      enabled: Boolean(ov.is_enabled),
      source: "override",
    };
  }

  return resolved;
}

export function canCapability(
  resolved: Record<string, ResolvedCapability>,
  key: string,
): boolean {
  return Boolean(resolved[key]?.enabled);
}

export async function fetchChannelCapabilityCatalog(): Promise<ChannelCapability[]> {
  const { data, error } = await (supabase as any)
    .from("channel_capability_catalog")
    .select("key, domain, title, description, is_active, default_params")
    .eq("is_active", true)
    .order("domain", { ascending: true })
    .order("key", { ascending: true });

  if (error) throw error;
  return (data ?? []) as ChannelCapability[];
}

export async function fetchChannelRoleCapabilities(
  role: ChannelRole,
): Promise<ChannelRoleCapability[]> {
  const { data, error } = await (supabase as any)
    .from("channel_role_capabilities")
    .select("role, capability_key, is_allowed")
    .eq("role", role);

  if (error) throw error;
  return (data ?? []) as ChannelRoleCapability[];
}

export async function fetchChannelCapabilityOverrides(
  channelId: string,
): Promise<ChannelCapabilityOverride[]> {
  const { data, error } = await (supabase as any)
    .from("channel_capability_overrides")
    .select("id, channel_id, capability_key, is_enabled, params, created_by, created_at, updated_at")
    .eq("channel_id", channelId);

  if (error) throw error;
  return (data ?? []) as ChannelCapabilityOverride[];
}

export async function checkChannelCapabilityViaRpc(
  channelId: string,
  userId: string,
  capabilityKey: string,
): Promise<boolean> {
  const { data, error } = await (supabase as any).rpc("channel_has_capability", {
    _channel_id: channelId,
    _user_id: userId,
    _capability_key: capabilityKey,
  });

  if (error) throw error;
  return Boolean(data);
}

export async function upsertChannelCapabilityOverride(input: {
  channelId: string;
  capabilityKey: string;
  isEnabled: boolean;
  params?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await (supabase as any).from("channel_capability_overrides").upsert(
    {
      channel_id: input.channelId,
      capability_key: input.capabilityKey,
      is_enabled: input.isEnabled,
      params: input.params ?? {},
    },
    { onConflict: "channel_id,capability_key" },
  );

  if (error) throw error;
}

