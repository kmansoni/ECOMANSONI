import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];

export interface Profile {
  id: string;
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  website: string | null;
  phone: string | null;
  verified: boolean;
  status_emoji: string | null;
  status_sticker_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Verification {
  type: string;
  is_active: boolean;
  verified_at: string | null;
}

export interface ProfileStats {
  postsCount: number;
  followersCount: number;
  followingCount: number;
}

function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    user_id: row.user_id,
    username: row.username ?? null,
    display_name: row.display_name,
    avatar_url: row.avatar_url,
    bio: row.bio ?? null,
    website: row.website ?? null,
    phone: row.phone ?? null,
    verified: row.verified ?? false,
    status_emoji: (row as Record<string, unknown>).status_emoji as string | null ?? null,
    status_sticker_url: (row as Record<string, unknown>).status_sticker_url as string | null ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function fetchProfileByUserId(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data ? toProfile(data) : null;
}

export async function fetchProfileByUsername(username: string): Promise<Profile | null> {
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(username);

  if (isUUID) {
    return fetchProfileByUserId(username);
  }

  // Canonical username lookup
  const { data: byUsername, error: byUsernameError } = await supabase
    .from('profiles')
    .select('*')
    .eq('username', username)
    .maybeSingle();

  if (byUsernameError) throw byUsernameError;
  if (byUsername) return toProfile(byUsername);

  // Backward compat: display_name fallback
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .ilike('display_name', username)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) throw error;
  return data?.[0] ? toProfile(data[0]) : null;
}

export async function fetchVerifications(userId: string): Promise<Verification[]> {
  const { data, error } = await supabase
    .from('user_verifications')
    .select('verification_type, is_active, verified_at')
    .eq('user_id', userId)
    .order('verified_at', { ascending: false });

  if (error) throw error;
  return (data || []).map((v) => ({
    type: v.verification_type,
    is_active: v.is_active,
    verified_at: v.verified_at,
  }));
}

export type ProfileUpdate = Partial<Pick<Profile, 'display_name' | 'username' | 'bio' | 'website' | 'avatar_url'>>;

export async function updateProfile(userId: string, updates: ProfileUpdate): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('user_id', userId);

  if (error) throw error;
}

export async function syncAuthMetadata(
  updates: ProfileUpdate,
): Promise<void> {
  const metaPatch: Record<string, unknown> = {};

  if (Object.prototype.hasOwnProperty.call(updates, 'display_name')) {
    const name = typeof updates.display_name === 'string' ? updates.display_name.trim() : '';
    metaPatch.full_name = name || null;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'avatar_url')) {
    const url = typeof updates.avatar_url === 'string' ? updates.avatar_url.trim() : '';
    metaPatch.avatar_url = url || null;
  }

  if (Object.keys(metaPatch).length > 0) {
    await supabase.auth.updateUser({ data: metaPatch });
  }
}
