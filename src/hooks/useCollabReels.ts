/**
 * useCollabReels — совместные Reels (приглашения, управление коллабораторами).
 *
 * - invite: пригласить коллаборатора
 * - respondToInvite: принять/отклонить приглашение
 * - myInvites: мои входящие pending-приглашения
 * - getCollaborators: получить коллабораторов для Reel
 * - loading: состояние
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

export interface ReelCollaborator {
  id: string;
  reel_id: string;
  collaborator_id: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
  collaborator?: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    username: string | null;
  };
}

export interface CollabInviteItem {
  id: string;
  reel_id: string;
  collaborator_id: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
  reel?: {
    id: string;
    content: string | null;
    author_id: string;
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export function useCollabReels() {
  const { user } = useAuth();
  const [myInvites, setMyInvites] = useState<CollabInviteItem[]>([]);
  const [loading, setLoading] = useState(false);

  const loadInvites = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await db
        .from('reel_collaborators')
        .select('id, reel_id, collaborator_id, status, created_at')
        .eq('collaborator_id', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        logger.error('[useCollabReels] Ошибка загрузки приглашений', { error });
        return;
      }

      setMyInvites((data ?? []) as CollabInviteItem[]);
    } catch (err) {
      logger.error('[useCollabReels] Непредвиденная ошибка', { error: err });
    }
  }, [user]);

  useEffect(() => {
    void loadInvites();
  }, [loadInvites]);

  const invite = useCallback(async (reelId: string, collaboratorId: string) => {
    if (!user) {
      toast.error('Необходима авторизация');
      return;
    }

    if (collaboratorId === user.id) {
      toast.error('Нельзя пригласить себя');
      return;
    }

    try {
      setLoading(true);
      const { error } = await db
        .from('reel_collaborators')
        .insert({ reel_id: reelId, collaborator_id: collaboratorId, status: 'pending' });

      if (error) {
        if (error.code === '23505') {
          toast.error('Приглашение уже отправлено');
        } else {
          logger.error('[useCollabReels] Ошибка приглашения', { reelId, collaboratorId, error });
          toast.error('Не удалось отправить приглашение');
        }
        return;
      }

      toast.success('Приглашение отправлено');
    } catch (err) {
      logger.error('[useCollabReels] Ошибка приглашения', { error: err });
      toast.error('Ошибка при отправке приглашения');
    } finally {
      setLoading(false);
    }
  }, [user]);

  const respondToInvite = useCallback(async (inviteId: string, accept: boolean) => {
    if (!user) return;

    try {
      setLoading(true);
      const { error } = await db
        .from('reel_collaborators')
        .update({ status: accept ? 'accepted' : 'declined' })
        .eq('id', inviteId)
        .eq('collaborator_id', user.id);

      if (error) {
        logger.error('[useCollabReels] Ошибка ответа на приглашение', { inviteId, error });
        toast.error('Не удалось ответить на приглашение');
        return;
      }

      toast.success(accept ? 'Коллаборация принята' : 'Приглашение отклонено');
      await loadInvites();
    } catch (err) {
      logger.error('[useCollabReels] Ошибка ответа на приглашение', { error: err });
      toast.error('Ошибка при ответе на приглашение');
    } finally {
      setLoading(false);
    }
  }, [user, loadInvites]);

  const getCollaborators = useCallback(async (reelId: string): Promise<ReelCollaborator[]> => {
    try {
      const { data, error } = await db
        .from('reel_collaborators')
        .select('id, reel_id, collaborator_id, status, created_at')
        .eq('reel_id', reelId)
        .order('created_at', { ascending: true })
        .limit(20);

      if (error) {
        logger.error('[useCollabReels] Ошибка получения коллабораторов', { reelId, error });
        return [];
      }

      // Подгружаем профили коллабораторов
      const collabs = (data ?? []) as ReelCollaborator[];
      if (collabs.length === 0) return [];

      const ids = collabs.map((c) => c.collaborator_id);
      const { data: profiles } = await db
        .from('profiles')
        .select('id, display_name, avatar_url, username')
        .in('id', ids)
        .limit(20);

      const profileMap = new Map<string, { id: string; display_name: string | null; avatar_url: string | null; username: string | null }>();
      for (const p of profiles ?? []) {
        profileMap.set(p.id, p);
      }

      return collabs.map((c) => ({
        ...c,
        collaborator: profileMap.get(c.collaborator_id) ?? undefined,
      }));
    } catch (err) {
      logger.error('[useCollabReels] Ошибка получения коллабораторов', { error: err });
      return [];
    }
  }, []);

  return { invite, respondToInvite, myInvites, getCollaborators, loading } as const;
}
