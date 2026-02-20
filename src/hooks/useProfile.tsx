import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface Verification {
  type: "owner" | "verified" | "professional" | "business";
  is_active: boolean;
  verified_at?: string;
}

export interface Profile {
  id: string;
  user_id: string;
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
        .single();

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

      // Fetch posts count
      const { count: postsCount } = await supabase
        .from('posts')
        .select('*', { count: 'exact', head: true })
        .eq('author_id', targetUserId);

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

      // Cast profileData to include new fields
      const extendedProfile = profileData as any;

      setProfile({
        id: extendedProfile.id,
        user_id: extendedProfile.user_id,
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
        // Fetch profile by display_name (case-insensitive)
        // Use limit(1) instead of maybeSingle() to handle duplicate names
        const { data, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .ilike('display_name', username)
          .order('created_at', { ascending: false })
          .limit(1);

        if (profileError) throw profileError;
        profileData = data?.[0] || null;
      }
      
      if (!profileData) {
        throw new Error('Profile not found');
      }

      const targetUserId = profileData.user_id;

      // Fetch posts count
      const { count: postsCount } = await supabase
        .from('posts')
        .select('*', { count: 'exact', head: true })
        .eq('author_id', targetUserId);

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
        const { data: postsData, error } = await supabase
          .from('posts')
          .select(`
            *,
            post_media (*)
          `)
          .eq('author_id', targetUserId)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setPosts(postsData || []);
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
