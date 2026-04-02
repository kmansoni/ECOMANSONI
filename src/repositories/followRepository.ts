import { supabase } from '@/integrations/supabase/client';

export async function getFollowersCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('followers')
    .select('*', { count: 'exact', head: true })
    .eq('following_id', userId);

  if (error) throw error;
  return count || 0;
}

export async function getFollowingCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('followers')
    .select('*', { count: 'exact', head: true })
    .eq('follower_id', userId);

  if (error) throw error;
  return count || 0;
}

export async function isFollowing(followerId: string, followingId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('followers')
    .select('id')
    .eq('follower_id', followerId)
    .eq('following_id', followingId)
    .maybeSingle();

  if (error) throw error;
  return !!data;
}

export async function follow(followerId: string, followingId: string): Promise<void> {
  const { error } = await supabase
    .from('followers')
    .insert({ follower_id: followerId, following_id: followingId });

  if (error) throw error;
}

export async function unfollow(followerId: string, followingId: string): Promise<void> {
  const { error } = await supabase
    .from('followers')
    .delete()
    .eq('follower_id', followerId)
    .eq('following_id', followingId);

  if (error) throw error;
}

export async function fetchProfileStats(
  targetUserId: string,
  currentUserId?: string,
): Promise<{
  followersCount: number;
  followingCount: number;
  isFollowing: boolean;
  isFollowedBy: boolean;
}> {
  const [followersCount, followingCount, following, followedBy] = await Promise.all([
    getFollowersCount(targetUserId),
    getFollowingCount(targetUserId),
    currentUserId && currentUserId !== targetUserId
      ? isFollowing(currentUserId, targetUserId)
      : Promise.resolve(false),
    currentUserId && currentUserId !== targetUserId
      ? isFollowing(targetUserId, currentUserId)
      : Promise.resolve(false),
  ]);

  return { followersCount, followingCount, isFollowing: following, isFollowedBy: followedBy };
}
