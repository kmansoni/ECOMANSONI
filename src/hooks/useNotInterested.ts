import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type ContentType = 'post' | 'reel' | 'user' | 'hashtag';
export type NotInterestedReason = 'not_interested' | 'dont_suggest' | 'irrelevant';

export function useNotInterested() {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const markNotInterested = useCallback(
    async (contentType: ContentType, contentId: string, reason: NotInterestedReason = 'not_interested') => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setDismissed(prev => new Set([...prev, contentId]));

      await (supabase as any)
        .from('not_interested')
        .upsert({
          user_id: user.id,
          content_type: contentType,
          content_id: contentId,
          reason,
        }, { onConflict: 'user_id,content_type,content_id' });
    },
    []
  );

  const undoNotInterested = useCallback(
    async (contentType: ContentType, contentId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setDismissed(prev => {
        const next = new Set(prev);
        next.delete(contentId);
        return next;
      });

      await (supabase as any)
        .from('not_interested')
        .delete()
        .eq('user_id', user.id)
        .eq('content_type', contentType)
        .eq('content_id', contentId);
    },
    []
  );

  const getNotInterestedIds = useCallback(
    async (contentType: ContentType): Promise<string[]> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data } = await (supabase as any)
        .from('not_interested')
        .select('content_id')
        .eq('user_id', user.id)
        .eq('content_type', contentType);

      const ids = (data ?? []).map((r: any) => r.content_id as string);
      setDismissed(new Set(ids));
      return ids;
    },
    []
  );

  const isNotInterested = useCallback(
    (contentId: string) => dismissed.has(contentId),
    [dismissed]
  );

  return { markNotInterested, undoNotInterested, getNotInterestedIds, isNotInterested, dismissed };
}
