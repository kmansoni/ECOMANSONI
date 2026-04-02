import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { useAuth } from './useAuth';
import { logger } from '@/lib/logger';
import {
  fetchProfileByUserId,
  fetchProfileByUsername as repoFetchByUsername,
  fetchVerifications,
  updateProfile as repoUpdateProfile,
  syncAuthMetadata,
} from '@/repositories/profileRepository';
import type { Profile, Verification, ProfileStats } from '@/repositories/profileRepository';
import {
  follow as repoFollow,
  unfollow as repoUnfollow,
  fetchProfileStats,
} from '@/repositories/followRepository';
import {
  getVisiblePostsCount,
  getArchivedPostIds,
} from '@/repositories/archiveRepository';
import type { PostWithMedia } from '@/repositories/archiveRepository';

// Re-export types for backward compatibility
export type { Profile, Verification, ProfileStats, PostWithMedia };
export type { Highlight } from '@/repositories/highlightRepository';

// Re-export standalone functions for backward compatibility
export { getHighlights, createHighlight, deleteHighlight } from '@/repositories/highlightRepository';
export { archivePost, unarchivePost, getArchivedPosts, blockUser, unblockUser, uploadAvatar } from '@/repositories/archiveRepository';

export interface ProfileWithStats extends Profile {
  stats: ProfileStats;
  verifications?: Verification[];
  isFollowing: boolean;
  isFollowedBy: boolean;
  isOwnProfile: boolean;
}

// ────────────────────────────────────────────────────────────────
// useProfile — загрузка профиля по user_id
// ────────────────────────────────────────────────────────────────
export function useProfile(userId?: string) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<ProfileWithStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const targetUserId = userId || user?.id;

  const loadProfile = useCallback(async () => {
    if (!targetUserId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const [profileData, verifications, socialStats, postsCount] = await Promise.all([
        fetchProfileByUserId(targetUserId),
        fetchVerifications(targetUserId),
        fetchProfileStats(targetUserId, user?.id),
        getVisiblePostsCount(targetUserId, user?.id),
      ]);

      // Фоллбэк для legacy пользователей без строки в profiles
      const fallbackDisplayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';
      const fallbackAvatar = user?.user_metadata?.avatar_url || null;

      const base: Profile = profileData ?? {
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
      };

      setProfile({
        ...base,
        verifications: verifications.length > 0 ? verifications : undefined,
        stats: {
          postsCount,
          followersCount: socialStats.followersCount,
          followingCount: socialStats.followingCount,
        },
        isFollowing: socialStats.isFollowing,
        isFollowedBy: socialStats.isFollowedBy,
        isOwnProfile: user?.id === targetUserId,
      });
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load profile'));
    } finally {
      setLoading(false);
    }
  }, [targetUserId, user]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const follow = useCallback(async () => {
    if (!user || !targetUserId || user.id === targetUserId) return;
    try {
      await repoFollow(user.id, targetUserId);
      setProfile(prev => prev ? {
        ...prev,
        isFollowing: true,
        stats: { ...prev.stats, followersCount: prev.stats.followersCount + 1 },
      } : null);
    } catch (err) {
      logger.error('[useProfile] Failed to follow', { error: err });
      throw err;
    }
  }, [user, targetUserId]);

  const unfollow = useCallback(async () => {
    if (!user || !targetUserId) return;
    try {
      await repoUnfollow(user.id, targetUserId);
      setProfile(prev => prev ? {
        ...prev,
        isFollowing: false,
        stats: { ...prev.stats, followersCount: Math.max(0, prev.stats.followersCount - 1) },
      } : null);
    } catch (err) {
      logger.error('[useProfile] Failed to unfollow', { error: err });
      throw err;
    }
  }, [user, targetUserId]);

  const updateProfileCb = useCallback(async (updates: Partial<Pick<Profile, 'display_name' | 'bio' | 'website' | 'avatar_url'>>) => {
    if (!user) return;
    try {
      await repoUpdateProfile(user.id, updates);
      await syncAuthMetadata(updates).catch((err) => {
        logger.warn('[useProfile] auth metadata sync failed', { error: err });
      });
      setProfile(prev => prev ? { ...prev, ...updates } : null);
    } catch (err) {
      logger.error('[useProfile] Failed to update profile', { error: err });
      throw err;
    }
  }, [user]);

  return {
    profile,
    loading,
    error,
    follow,
    unfollow,
    updateProfile: updateProfileCb,
    refetch: loadProfile,
  };
}

// ────────────────────────────────────────────────────────────────
// useProfileByUsername — загрузка профиля по username / display_name
// ────────────────────────────────────────────────────────────────
export function useProfileByUsername(username?: string) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<ProfileWithStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadProfile = useCallback(async () => {
    if (!username) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const profileData = await repoFetchByUsername(username);
      if (!profileData) throw new Error('Profile not found');

      const targetUserId = profileData.user_id;

      const [socialStats, postsCount] = await Promise.all([
        fetchProfileStats(targetUserId, user?.id),
        getVisiblePostsCount(targetUserId, user?.id),
      ]);

      setProfile({
        ...profileData,
        stats: {
          postsCount,
          followersCount: socialStats.followersCount,
          followingCount: socialStats.followingCount,
        },
        isFollowing: socialStats.isFollowing,
        isFollowedBy: socialStats.isFollowedBy,
        isOwnProfile: user?.id === targetUserId,
      });
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Profile not found'));
    } finally {
      setLoading(false);
    }
  }, [username, user]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const follow = useCallback(async () => {
    if (!user || !profile || user.id === profile.user_id) return;
    try {
      await repoFollow(user.id, profile.user_id);
      setProfile(prev => prev ? {
        ...prev,
        isFollowing: true,
        stats: { ...prev.stats, followersCount: prev.stats.followersCount + 1 },
      } : null);
    } catch (err) {
      logger.error('[useProfile] Failed to follow', { error: err });
      throw err;
    }
  }, [user, profile]);

  const unfollow = useCallback(async () => {
    if (!user || !profile) return;
    try {
      await repoUnfollow(user.id, profile.user_id);
      setProfile(prev => prev ? {
        ...prev,
        isFollowing: false,
        stats: { ...prev.stats, followersCount: Math.max(0, prev.stats.followersCount - 1) },
      } : null);
    } catch (err) {
      logger.error('[useProfile] Failed to unfollow', { error: err });
      throw err;
    }
  }, [user, profile]);

  return {
    profile,
    loading,
    error,
    follow,
    unfollow,
    refetch: loadProfile,
  };
}

// ────────────────────────────────────────────────────────────────
// useUserPosts — посты пользователя с фильтрацией архива
// ────────────────────────────────────────────────────────────────
type PostRow = Database['public']['Tables']['posts']['Row'];
type PostMediaRow = Database['public']['Tables']['post_media']['Row'];
type PostWithMediaLocal = PostRow & { post_media: PostMediaRow[] };

export function useUserPosts(userId?: string) {
  const { user } = useAuth();
  const [posts, setPosts] = useState<PostWithMediaLocal[]>([]);
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
        const archivedPostIds = isOwnProfile ? await getArchivedPostIds(targetUserId) : [];
        const archivedSet = new Set(archivedPostIds);

        const { data: postsData, error: joinError } = await supabase
          .from('posts')
          .select('*, post_media (*)')
          .eq('author_id', targetUserId)
          .eq('is_published', true)
          .order('created_at', { ascending: false });

        if (!joinError) {
          setPosts((postsData || []).filter((post) => !archivedSet.has(String(post.id))));
          return;
        }

        // Фоллбэк: раздельная загрузка (когда relation metadata отсутствует)
        const { data: plainPosts, error: postsError } = await supabase
          .from('posts')
          .select('*')
          .eq('author_id', targetUserId)
          .eq('is_published', true)
          .order('created_at', { ascending: false });

        if (postsError) throw postsError;

        const postIds = (plainPosts || []).map((p) => p.id).filter(Boolean);
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

        const mediaByPostId = new Map<string, PostMediaRow[]>();
        for (const media of mediaRows || []) {
          const key = String(media.post_id || '');
          if (!key) continue;
          const arr = mediaByPostId.get(key) || [];
          arr.push(media);
          mediaByPostId.set(key, arr);
        }

        const merged = (plainPosts || []).map((post) => ({
          ...post,
          post_media: mediaByPostId.get(String(post.id)) || [],
        })).filter((post) => !archivedSet.has(String(post.id)));

        setPosts(merged);
      } catch (err) {
        logger.error('[useProfile] Failed to load posts', { error: err });
      } finally {
        setLoading(false);
      }
    };

    fetchPosts();
  }, [targetUserId, user?.id]);

  return { posts, loading };
}
