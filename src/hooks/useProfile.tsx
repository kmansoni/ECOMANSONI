import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { uploadMedia } from '@/lib/mediaUpload';

export interface Verification {
  type: "owner" | "verified" | "professional" | "business";
  is_active: boolean;
  verified_at?: string;
}

export interface Profile {
  id: string;
  user_id: string;
  username?: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  website: string | null;
  phone: string | null;
  verified: boolean;
  verifications?: Verification[];
  status_emoji?: string | null;
  status_sticker_url?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProfileStats {
  postsCount: number;
  followersCount: number;
  followingCount: number;
}

export interface ProfileWithStats extends Profile {
  stats: ProfileStats;
  isFollowing: boolean;
  isOwnProfile: boolean;
}

async function getArchivedPostIdsForUser(userId: string): Promise<string[]> {
  const { data, error } = await (supabase as any)
    .from('archived_posts')
    .select('post_id')
    .eq('user_id', userId);

  if (error) throw error;
  return (data || []).map((row: any) => String(row.post_id)).filter(Boolean);
}

async function getVisiblePostsCount(targetUserId: string, currentUserId?: string): Promise<number> {
  const { count: totalPublished, error: totalError } = await supabase
    .from('posts')
    .select('*', { count: 'exact', head: true })
    .eq('author_id', targetUserId)
    .eq('is_published', true);

  if (totalError) throw totalError;

  const total = totalPublished || 0;
  if (!currentUserId || currentUserId !== targetUserId || total === 0) return total;

  const archivedPostIds = await getArchivedPostIdsForUser(targetUserId);
  if (archivedPostIds.length === 0) return total;

  const { count: archivedPublishedCount, error: archivedError } = await supabase
    .from('posts')
    .select('*', { count: 'exact', head: true })
    .eq('author_id', targetUserId)
    .eq('is_published', true)
    .in('id', archivedPostIds);

  if (archivedError) throw archivedError;

  return Math.max(0, total - (archivedPublishedCount || 0));
}

export function useProfile(userId?: string) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<ProfileWithStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const targetUserId = userId || user?.id;

  const fetchProfile = useCallback(async () => {
    if (!targetUserId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Fetch profile data
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', targetUserId)
        .maybeSingle();

      if (profileError) throw profileError;

      // Fetch verifications
      const { data: verificationsData } = await (supabase as any)
        .from('user_verifications')
        .select('verification_type, is_active, verified_at')
        .eq('user_id', targetUserId)
        .order('verified_at', { ascending: false });

      const verifications = (verificationsData || []).map((v: any) => ({
        type: v.verification_type,
        is_active: v.is_active,
        verified_at: v.verified_at,
      }));

      const postsCount = await getVisiblePostsCount(targetUserId, user?.id);

      // Fetch followers count (using any for new table)
      const { count: followersCount } = await (supabase as any)
        .from('followers')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', targetUserId);

      // Fetch following count
      const { count: followingCount } = await (supabase as any)
        .from('followers')
        .select('*', { count: 'exact', head: true })
        .eq('follower_id', targetUserId);

      // Check if current user follows this profile
      let isFollowing = false;
      if (user && user.id !== targetUserId) {
        const { data: followData } = await (supabase as any)
          .from('followers')
          .select('id')
          .eq('follower_id', user.id)
          .eq('following_id', targetUserId)
          .maybeSingle();
        
        isFollowing = !!followData;
      }

      // Some legacy users may not have a profiles row yet. Keep screen functional with auth fallback.
      const fallbackDisplayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';
      const fallbackAvatar = user?.user_metadata?.avatar_url || null;
      const extendedProfile = (profileData ?? {
        id: `fallback-${targetUserId}`,
        user_id: targetUserId,
        username: null,
        display_name: fallbackDisplayName,
        avatar_url: fallbackAvatar,
        bio: null,
        website: null,
        phone: null,
        verified: false,
        status_emoji: null,
        status_sticker_url: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }) as any;

      setProfile({
        id: extendedProfile.id,
        user_id: extendedProfile.user_id,
        username: extendedProfile.username ?? null,
        display_name: extendedProfile.display_name,
        avatar_url: extendedProfile.avatar_url,
        bio: extendedProfile.bio ?? null,
        website: extendedProfile.website ?? null,
        phone: extendedProfile.phone,
        verified: extendedProfile.verified ?? false,
        verifications: verifications.length > 0 ? verifications : undefined,
        status_emoji: extendedProfile.status_emoji ?? null,
        status_sticker_url: extendedProfile.status_sticker_url ?? null,
        created_at: extendedProfile.created_at,
        updated_at: extendedProfile.updated_at,
        stats: {
          postsCount: postsCount || 0,
          followersCount: followersCount || 0,
          followingCount: followingCount || 0,
        },
        isFollowing,
        isOwnProfile: user?.id === targetUserId,
      });
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load profile'));
    } finally {
      setLoading(false);
    }
  }, [targetUserId, user]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const follow = useCallback(async () => {
    if (!user || !targetUserId || user.id === targetUserId) return;

    try {
      const { error } = await (supabase as any)
        .from('followers')
        .insert({ follower_id: user.id, following_id: targetUserId });

      if (error) throw error;

      setProfile(prev => prev ? {
        ...prev,
        isFollowing: true,
        stats: {
          ...prev.stats,
          followersCount: prev.stats.followersCount + 1,
        },
      } : null);
    } catch (err) {
      console.error('Failed to follow:', err);
      throw err;
    }
  }, [user, targetUserId]);

  const unfollow = useCallback(async () => {
    if (!user || !targetUserId) return;

    try {
      const { error } = await (supabase as any)
        .from('followers')
        .delete()
        .eq('follower_id', user.id)
        .eq('following_id', targetUserId);

      if (error) throw error;

      setProfile(prev => prev ? {
        ...prev,
        isFollowing: false,
        stats: {
          ...prev.stats,
          followersCount: Math.max(0, prev.stats.followersCount - 1),
        },
      } : null);
    } catch (err) {
      console.error('Failed to unfollow:', err);
      throw err;
    }
  }, [user, targetUserId]);

  const updateProfile = useCallback(async (updates: Partial<Pick<Profile, 'display_name' | 'bio' | 'website' | 'avatar_url'>>) => {
    if (!user) return;

    try {
      const { error } = await (supabase as any)
        .from('profiles')
        .update(updates)
        .eq('user_id', user.id);

      if (error) throw error;

      // Keep Supabase Auth metadata in sync (Dashboard -> Authentication -> Users).
      // Best-effort: profile is canonical; metadata sync failure shouldn't block saving.
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
        const { error: metaError } = await supabase.auth.updateUser({ data: metaPatch });
        if (metaError) {
          console.warn('[useProfile] auth.updateUser metadata sync failed:', metaError);
        }
      }

      setProfile(prev => prev ? { ...prev, ...updates } : null);
    } catch (err) {
      console.error('Failed to update profile:', err);
      throw err;
    }
  }, [user]);

  return {
    profile,
    loading,
    error,
    follow,
    unfollow,
    updateProfile,
    refetch: fetchProfile,
  };
}

// Hook to fetch profile by display_name (username)
export function useProfileByUsername(username?: string) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<ProfileWithStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchProfile = useCallback(async () => {
    if (!username) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      let profileData = null;
      
      // Check if username looks like a UUID (user_id)
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(username);
      
      if (isUUID) {
        // Fetch profile by user_id
        const { data, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', username)
          .maybeSingle();
        
        if (profileError) throw profileError;
        profileData = data;
      } else {
        // Prefer canonical username field first.
        const { data: byUsername, error: byUsernameError } = await supabase
          .from('profiles')
          .select('*')
          .eq('username', username)
          .maybeSingle();

        if (byUsernameError) throw byUsernameError;
        profileData = byUsername;

        if (!profileData) {
          // Backward compatibility: some routes still pass display_name.
          const { data, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .ilike('display_name', username)
            .order('created_at', { ascending: false })
            .limit(1);

          if (profileError) throw profileError;
          profileData = data?.[0] || null;
        }
      }
      
      if (!profileData) {
        throw new Error('Profile not found');
      }

      const targetUserId = profileData.user_id;

      const postsCount = await getVisiblePostsCount(targetUserId, user?.id);

      // Fetch followers count
      const { count: followersCount } = await (supabase as any)
        .from('followers')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', targetUserId);

      // Fetch following count
      const { count: followingCount } = await (supabase as any)
        .from('followers')
        .select('*', { count: 'exact', head: true })
        .eq('follower_id', targetUserId);

      // Check if current user follows this profile
      let isFollowing = false;
      if (user && user.id !== targetUserId) {
        const { data: followData } = await (supabase as any)
          .from('followers')
          .select('id')
          .eq('follower_id', user.id)
          .eq('following_id', targetUserId)
          .maybeSingle();
        
        isFollowing = !!followData;
      }

      const extendedProfile = profileData as any;

      setProfile({
        id: extendedProfile.id,
        user_id: extendedProfile.user_id,
        username: extendedProfile.username ?? null,
        display_name: extendedProfile.display_name,
        avatar_url: extendedProfile.avatar_url,
        bio: extendedProfile.bio ?? null,
        website: extendedProfile.website ?? null,
        phone: extendedProfile.phone,
        verified: extendedProfile.verified ?? false,
        created_at: extendedProfile.created_at,
        updated_at: extendedProfile.updated_at,
        stats: {
          postsCount: postsCount || 0,
          followersCount: followersCount || 0,
          followingCount: followingCount || 0,
        },
        isFollowing,
        isOwnProfile: user?.id === targetUserId,
      });
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Profile not found'));
    } finally {
      setLoading(false);
    }
  }, [username, user]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const follow = useCallback(async () => {
    if (!user || !profile || user.id === profile.user_id) return;

    try {
      const { error } = await (supabase as any)
        .from('followers')
        .insert({ follower_id: user.id, following_id: profile.user_id });

      if (error) throw error;

      setProfile(prev => prev ? {
        ...prev,
        isFollowing: true,
        stats: {
          ...prev.stats,
          followersCount: prev.stats.followersCount + 1,
        },
      } : null);
    } catch (err) {
      console.error('Failed to follow:', err);
      throw err;
    }
  }, [user, profile]);

  const unfollow = useCallback(async () => {
    if (!user || !profile) return;

    try {
      const { error } = await (supabase as any)
        .from('followers')
        .delete()
        .eq('follower_id', user.id)
        .eq('following_id', profile.user_id);

      if (error) throw error;

      setProfile(prev => prev ? {
        ...prev,
        isFollowing: false,
        stats: {
          ...prev.stats,
          followersCount: Math.max(0, prev.stats.followersCount - 1),
        },
      } : null);
    } catch (err) {
      console.error('Failed to unfollow:', err);
      throw err;
    }
  }, [user, profile]);

  return {
    profile,
    loading,
    error,
    follow,
    unfollow,
    refetch: fetchProfile,
  };
}

// ────────────────────────────────────────────────────────────────
// Highlights
// ────────────────────────────────────────────────────────────────
export interface Highlight {
  id: string;
  user_id: string;
  title: string;
  cover_url: string | null;
  position: number;
  created_at: string;
}

export async function getHighlights(userId: string): Promise<Highlight[]> {
  const { data, error } = await (supabase as any)
    .from('highlights')
    .select('*')
    .eq('user_id', userId)
    .order('position', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createHighlight(
  userId: string,
  title: string,
  coverFile: File | null,
  storyIds: string[]
): Promise<Highlight> {
  let cover_url: string | null = null;
  if (coverFile) {
    try {
      const uploadResult = await uploadMedia(coverFile, { bucket: 'avatars' });
      cover_url = uploadResult.url;
    } catch {
      // silently skip cover upload failure, create highlight without cover
    }
  }

  const { data: highlight, error } = await (supabase as any)
    .from('highlights')
    .insert({ user_id: userId, title, cover_url })
    .select()
    .single();
  if (error) throw error;

  if (storyIds.length > 0) {
    const rows = storyIds.map((story_id, i) => ({
      highlight_id: highlight.id,
      story_id,
      position: i,
    }));
    await (supabase as any).from('highlight_stories').insert(rows);
  }

  return highlight;
}

export async function deleteHighlight(id: string): Promise<void> {
  const { error } = await (supabase as any)
    .from('highlights')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ────────────────────────────────────────────────────────────────
// Archive
// ────────────────────────────────────────────────────────────────
export async function archivePost(userId: string, postId: string): Promise<void> {
  const { error } = await (supabase as any)
    .from('archived_posts')
    .insert({ user_id: userId, post_id: postId });
  if (error) throw error;
}

export async function unarchivePost(userId: string, postId: string): Promise<void> {
  const { error } = await (supabase as any)
    .from('archived_posts')
    .delete()
    .eq('user_id', userId)
    .eq('post_id', postId);
  if (error) throw error;
}

export async function getArchivedPosts(userId: string): Promise<any[]> {
  const { data, error } = await (supabase as any)
    .from('archived_posts')
    .select('post_id, posts(*, post_media(*))')
    .eq('user_id', userId)
    .order('archived_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((row: any) => row.posts).filter(Boolean);
}

// ────────────────────────────────────────────────────────────────
// Block
// ────────────────────────────────────────────────────────────────
export async function blockUser(blockerId: string, blockedId: string): Promise<void> {
  const { error } = await (supabase as any)
    .from('blocked_users')
    .insert({ blocker_id: blockerId, blocked_id: blockedId });
  if (error) throw error;
}

export async function unblockUser(blockerId: string, blockedId: string): Promise<void> {
  const { error } = await (supabase as any)
    .from('blocked_users')
    .delete()
    .eq('blocker_id', blockerId)
    .eq('blocked_id', blockedId);
  if (error) throw error;
}

// ────────────────────────────────────────────────────────────────
// uploadAvatar helper
// ────────────────────────────────────────────────────────────────
export async function uploadAvatar(userId: string, file: File): Promise<string> {
  const result = await uploadMedia(file, { bucket: 'avatars' });
  return `${result.url}?t=${Date.now()}`;
}

// Hook to get user's posts
export function useUserPosts(userId?: string) {
  const { user } = useAuth();
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const targetUserId = userId || user?.id;

  useEffect(() => {
    if (!targetUserId) {
      setLoading(false);
      return;
    }

    const fetchPosts = async () => {
      try {
        const isOwnProfile = user?.id === targetUserId;
        const archivedPostIds = isOwnProfile ? await getArchivedPostIdsForUser(targetUserId) : [];
        const archivedSet = new Set(archivedPostIds);

        const { data: postsData, error } = await supabase
          .from('posts')
          .select(`
            *,
            post_media (*)
          `)
          .eq('author_id', targetUserId)
          .eq('is_published', true)
          .order('created_at', { ascending: false });

        if (!error) {
          const visiblePosts = (postsData || []).filter((post: any) => !archivedSet.has(String(post.id)));
          setPosts(visiblePosts);
          return;
        }

        // Fallback when relation metadata is missing on remote DB.
        // Load posts first, then post_media by post IDs.
        const { data: plainPosts, error: postsError } = await supabase
          .from('posts')
          .select('*')
          .eq('author_id', targetUserId)
          .eq('is_published', true)
          .order('created_at', { ascending: false });

        if (postsError) throw postsError;

        const postIds = (plainPosts || []).map((p: any) => p.id).filter(Boolean);
        if (postIds.length === 0) {
          setPosts([]);
          return;
        }

        const { data: mediaRows, error: mediaError } = await supabase
          .from('post_media')
          .select('*')
          .in('post_id', postIds)
          .order('sort_order', { ascending: true });

        if (mediaError) throw mediaError;

        const mediaByPostId = new Map<string, any[]>();
        for (const media of mediaRows || []) {
          const key = String((media as any).post_id || '');
          if (!key) continue;
          const arr = mediaByPostId.get(key) || [];
          arr.push(media);
          mediaByPostId.set(key, arr);
        }

        const merged = (plainPosts || []).map((post: any) => ({
          ...post,
          post_media: mediaByPostId.get(String(post.id)) || [],
        })).filter((post: any) => !archivedSet.has(String(post.id)));

        setPosts(merged);
      } catch (err) {
        console.error('Failed to load posts:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchPosts();
  }, [targetUserId]);

  return { posts, loading };
}
