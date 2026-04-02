import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type PostRow = Database['public']['Tables']['posts']['Row'];
type PostMediaRow = Database['public']['Tables']['post_media']['Row'];
export type PostWithMedia = PostRow & { post_media: PostMediaRow[] };

export async function getArchivedPostIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('archived_posts')
    .select('post_id')
    .eq('user_id', userId);

  if (error) throw error;
  return (data || []).map((row) => String(row.post_id)).filter(Boolean);
}

export async function getVisiblePostsCount(
  targetUserId: string,
  currentUserId?: string,
): Promise<number> {
  const { count: totalPublished, error: totalError } = await supabase
    .from('posts')
    .select('*', { count: 'exact', head: true })
    .eq('author_id', targetUserId)
    .eq('is_published', true);

  if (totalError) throw totalError;
  const total = totalPublished || 0;

  if (!currentUserId || currentUserId !== targetUserId || total === 0) return total;

  const archivedPostIds = await getArchivedPostIds(targetUserId);
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

export async function archivePost(userId: string, postId: string): Promise<void> {
  const { error } = await supabase
    .from('archived_posts')
    .insert({ user_id: userId, post_id: postId });

  if (error) throw error;
}

export async function unarchivePost(userId: string, postId: string): Promise<void> {
  const { error } = await supabase
    .from('archived_posts')
    .delete()
    .eq('user_id', userId)
    .eq('post_id', postId);

  if (error) throw error;
}

export async function getArchivedPosts(userId: string): Promise<PostWithMedia[]> {
  const { data, error } = await supabase
    .from('archived_posts')
    .select('post_id, posts(*, post_media(*))')
    .eq('user_id', userId)
    .order('archived_at', { ascending: false });

  if (error) throw error;

  type ArchivedRow = { post_id: string; posts: PostWithMedia | null };
  return ((data || []) as unknown as ArchivedRow[])
    .map((row) => row.posts)
    .filter((p): p is PostWithMedia => p !== null);
}

export async function blockUser(blockerId: string, blockedId: string): Promise<void> {
  const { error } = await supabase
    .from('blocked_users')
    .insert({ blocker_id: blockerId, blocked_id: blockedId });

  if (error) throw error;
}

export async function unblockUser(blockerId: string, blockedId: string): Promise<void> {
  const { error } = await supabase
    .from('blocked_users')
    .delete()
    .eq('blocker_id', blockerId)
    .eq('blocked_id', blockedId);

  if (error) throw error;
}

export async function uploadAvatar(userId: string, file: File): Promise<string> {
  const { uploadMedia } = await import('@/lib/mediaUpload');
  const result = await uploadMedia(file, { bucket: 'avatars' });
  return `${result.url}?t=${Date.now()}`;
}
