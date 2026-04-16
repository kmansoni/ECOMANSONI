/**
 * useGridReorder — перестановка постов в сетке профиля drag-and-drop.
 *
 * - isEditing: режим редактирования сетки
 * - startEditing / stopEditing: вход/выход из режима
 * - reorder(positions): сохранение нового порядка в БД
 * - loading: состояние сохранения
 */

import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { dbLoose } from "@/lib/supabase";

export interface GridPosition {
  post_id: string;
  sort_order: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useGridReorder(userId: string) {
  const { user } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);

  const startEditing = useCallback(() => {
    if (!user || user.id !== userId) {
      toast.error('Можно редактировать только свой профиль');
      return;
    }
    setIsEditing(true);
  }, [user, userId]);

  const stopEditing = useCallback(() => {
    setIsEditing(false);
  }, []);

  const reorder = useCallback(async (positions: GridPosition[]) => {
    if (!user || user.id !== userId) {
      toast.error('Нет прав для изменения порядка');
      return;
    }

    if (positions.length === 0) return;

    setLoading(true);
    try {
      const updates = positions.map((pos) =>
        dbLoose
          .from('posts')
          .update({ grid_sort_order: pos.sort_order })
          .eq('id', pos.post_id)
          .eq('author_id', user.id)
      );

      const results = await Promise.all(updates);
      const failed = results.filter((r: { error: unknown }) => r.error);

      if (failed.length > 0) {
        logger.error('[useGridReorder] Частичная ошибка обновления порядка', {
          failed: failed.length,
          total: positions.length,
        });
        toast.error('Не удалось сохранить порядок некоторых постов');
        return;
      }

      toast.success('Порядок сохранён');
      setIsEditing(false);
    } catch (err) {
      logger.error('[useGridReorder] Ошибка сохранения порядка', { error: err });
      toast.error('Ошибка сохранения порядка');
    } finally {
      setLoading(false);
    }
  }, [user, userId]);

  return { isEditing, startEditing, stopEditing, reorder, loading } as const;
}
