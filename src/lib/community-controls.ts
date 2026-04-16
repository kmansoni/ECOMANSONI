import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { isTableMissingError } from "@/lib/utils/isTableMissingError";

const UserCommunitySettingsSchema = z.object({
  user_id: z.string(),
  allow_channel_invites: z.boolean(),
  allow_group_invites: z.boolean(),
  auto_join_by_invite: z.boolean(),
  mute_new_communities: z.boolean(),
  show_media_preview: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type UserCommunitySettings = z.infer<typeof UserCommunitySettingsSchema>;

const DEFAULT_SETTINGS = {
  allow_channel_invites: true,
  allow_group_invites: true,
  auto_join_by_invite: false,
  mute_new_communities: false,
  show_media_preview: true,
};

function localKey(userId: string) {
  return `community-settings:${userId}`;
}

function readLocalSettings(userId: string): UserCommunitySettings | null {
  try {
    const raw = localStorage.getItem(localKey(userId));
    if (!raw) return null;
    const result = UserCommunitySettingsSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function writeLocalSettings(row: UserCommunitySettings) {
  try {
    localStorage.setItem(localKey(row.user_id), JSON.stringify(row));
  } catch {
    // ignore localStorage quota/runtime issues
  }
}

function defaultRow(userId: string): UserCommunitySettings {
  const now = new Date().toISOString();
  return {
    user_id: userId,
    ...DEFAULT_SETTINGS,
    created_at: now,
    updated_at: now,
  };
}

export async function getOrCreateUserCommunitySettings(userId: string): Promise<UserCommunitySettings> {
  const table = supabase.from("user_channel_group_settings");
  const { data, error } = await table.select("*").eq("user_id", userId).maybeSingle();
  if (error && isTableMissingError(error)) {
    return readLocalSettings(userId) ?? defaultRow(userId);
  }
  if (error) throw error;
  if (data) return data as UserCommunitySettings;

  const { data: inserted, error: insertError } = await table
    .insert({ user_id: userId, ...DEFAULT_SETTINGS })
    .select("*")
    .single();
  if (insertError && isTableMissingError(insertError)) {
    const local = readLocalSettings(userId) ?? defaultRow(userId);
    writeLocalSettings(local);
    return local;
  }
  if (insertError) throw insertError;
  writeLocalSettings(inserted as UserCommunitySettings);
  return inserted as UserCommunitySettings;
}

export async function updateUserCommunitySettings(
  userId: string,
  patch: Partial<Omit<UserCommunitySettings, "user_id" | "created_at" | "updated_at">>,
): Promise<UserCommunitySettings> {
  const { data, error } = await supabase
    .from("user_channel_group_settings")
    .upsert({ user_id: userId, ...patch }, { onConflict: "user_id" })
    .select("*")
    .single();
  if (error && isTableMissingError(error)) {
    const current = readLocalSettings(userId) ?? defaultRow(userId);
    const next: UserCommunitySettings = {
      ...current,
      ...patch,
      updated_at: new Date().toISOString(),
    };
    writeLocalSettings(next);
    return next;
  }
  if (error) throw error;
  writeLocalSettings(data as UserCommunitySettings);
  return data as UserCommunitySettings;
}

export async function createChannelInviteToken(
  channelId: string,
  maxUses?: number | null,
  ttlHours = 24,
): Promise<string> {
  const { data, error } = await supabase.rpc("create_channel_invite", {
    _channel_id: channelId,
    _max_uses: maxUses ?? undefined,
    _ttl_hours: ttlHours,
  });
  if (error && isTableMissingError(error)) {
    throw new Error("invite_schema_missing:create_channel_invite");
  }
  if (error) throw error;
  return String(data);
}

export async function createGroupInviteToken(
  groupId: string,
  maxUses?: number | null,
  ttlHours = 24,
): Promise<string> {
  const { data, error } = await supabase.rpc("create_group_invite", {
    _group_id: groupId,
    _max_uses: maxUses ?? undefined,
    _ttl_hours: ttlHours,
  });
  if (error && isTableMissingError(error)) {
    throw new Error("invite_schema_missing:create_group_invite");
  }
  if (error) throw error;
  return String(data);
}

export async function joinChannelByInviteToken(token: string): Promise<string> {
  const { data, error } = await supabase.rpc("join_channel_by_invite", {
    _token: token,
  });
  if (error && isTableMissingError(error)) {
    throw new Error("invite_schema_missing:join_channel_by_invite");
  }
  if (error) throw error;
  return String(data);
}

export async function joinGroupByInviteToken(token: string): Promise<string> {
  const { data, error } = await supabase.rpc("join_group_by_invite", {
    _token: token,
  });
  if (error && isTableMissingError(error)) {
    throw new Error("invite_schema_missing:join_group_by_invite");
  }
  if (error) throw error;
  return String(data);
}
