import { supabase } from '@/integrations/supabase/client';
import { uploadMedia } from '@/lib/mediaUpload';
import { logger } from '@/lib/logger';

export interface Highlight {
  id: string;
  user_id: string;
  title: string;
  cover_url: string | null;
  position: number;
  created_at: string;
}

export async function getHighlights(userId: string): Promise<Highlight[]> {
  const { data, error } = await supabase
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
  storyIds: string[],
): Promise<Highlight> {
  let cover_url: string | null = null;
  if (coverFile) {
    try {
      const uploadResult = await uploadMedia(coverFile, { bucket: 'avatars' });
      cover_url = uploadResult.url;
    } catch (err) {
      logger.warn('[highlightRepository] cover upload failed, creating without cover', { error: err });
    }
  }

  const { data: highlight, error } = await supabase
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
    const { error: insertError } = await supabase.from('highlight_stories').insert(rows);
    if (insertError) {
      logger.warn('[highlightRepository] highlight_stories insert failed', { error: insertError });
    }
  }

  return highlight;
}

export async function deleteHighlight(id: string): Promise<void> {
  const { error } = await supabase
    .from('highlights')
    .delete()
    .eq('id', id);

  if (error) throw error;
}
