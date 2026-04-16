/**
 * useTestimonials — рекомендации пользователей.
 *
 * - testimonials: одобренные рекомендации
 * - pendingTestimonials: ожидающие одобрения (для владельца профиля)
 * - writeTestimonial: написать рекомендацию
 * - approve / reject: одобрить / отклонить
 * - loading: состояние
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { dbLoose } from "@/lib/supabase";

export interface Testimonial {
  id: string;
  author_id: string;
  target_user_id: string;
  text: string;
  is_approved: boolean;
  created_at: string;
  author?: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    username: string | null;
  };
}

export function useTestimonials(userId: string) {
  const { user } = useAuth();
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [pendingTestimonials, setPendingTestimonials] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);

  const isOwner = user?.id === userId;

  const loadTestimonials = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // Одобренные
      const { data: approved, error: apprErr } = await dbLoose
        .from('testimonials')
        .select('id, author_id, target_user_id, text, is_approved, created_at')
        .eq('target_user_id', userId)
        .eq('is_approved', true)
        .order('created_at', { ascending: false })
        .limit(50);

      if (apprErr) {
        logger.error('[useTestimonials] Ошибка загрузки одобренных', { error: apprErr });
      }

      // Подгружаем авторов
      const approvedList = (approved ?? []) as Testimonial[];
      const authorIds = [...new Set(approvedList.map((t) => t.author_id))];

      let profileMap = new Map<string, { id: string; display_name: string | null; avatar_url: string | null; username: string | null }>();
      if (authorIds.length > 0) {
        const { data: profiles } = await dbLoose
          .from('profiles')
          .select('id, display_name, avatar_url, username')
          .in('id', authorIds)
          .limit(50);

        for (const p of profiles ?? []) {
          profileMap.set(p.id, p);
        }
      }

      setTestimonials(
        approvedList.map((t) => ({ ...t, author: profileMap.get(t.author_id) ?? undefined }))
      );

      // Pending — только для владельца
      if (isOwner) {
        const { data: pending, error: pendErr } = await dbLoose
          .from('testimonials')
          .select('id, author_id, target_user_id, text, is_approved, created_at')
          .eq('target_user_id', userId)
          .eq('is_approved', false)
          .order('created_at', { ascending: false })
          .limit(50);

        if (pendErr) {
          logger.error('[useTestimonials] Ошибка загрузки pending', { error: pendErr });
        }

        const pendingList = (pending ?? []) as Testimonial[];
        const pendingAuthorIds = [...new Set(pendingList.map((t) => t.author_id))].filter((id) => !profileMap.has(id));

        if (pendingAuthorIds.length > 0) {
          const { data: moreProfiles } = await dbLoose
            .from('profiles')
            .select('id, display_name, avatar_url, username')
            .in('id', pendingAuthorIds)
            .limit(50);

          for (const p of moreProfiles ?? []) {
            profileMap.set(p.id, p);
          }
        }

        setPendingTestimonials(
          pendingList.map((t) => ({ ...t, author: profileMap.get(t.author_id) ?? undefined }))
        );
      }
    } catch (err) {
      logger.error('[useTestimonials] Непредвиденная ошибка', { error: err });
    } finally {
      setLoading(false);
    }
  }, [userId, isOwner]);

  useEffect(() => {
    void loadTestimonials();
  }, [loadTestimonials]);

  const writeTestimonial = useCallback(async (targetUserId: string, text: string) => {
    if (!user) {
      toast.error('Необходима авторизация');
      return;
    }

    if (user.id === targetUserId) {
      toast.error('Нельзя написать рекомендацию себе');
      return;
    }

    const trimmed = text.trim();
    if (trimmed.length < 10) {
      toast.error('Минимум 10 символов');
      return;
    }
    if (trimmed.length > 500) {
      toast.error('Максимум 500 символов');
      return;
    }

    try {
      setLoading(true);
      const { error } = await dbLoose
        .from('testimonials')
        .insert({
          author_id: user.id,
          target_user_id: targetUserId,
          text: trimmed,
          is_approved: false,
        });

      if (error) {
        if (error.code === '23505') {
          toast.error('Вы уже написали рекомендацию этому пользователю');
        } else {
          logger.error('[useTestimonials] Ошибка записи', { error });
          toast.error('Не удалось отправить рекомендацию');
        }
        return;
      }

      toast.success('Рекомендация отправлена на модерацию');
    } catch (err) {
      logger.error('[useTestimonials] Ошибка записи', { error: err });
      toast.error('Ошибка при отправке рекомендации');
    } finally {
      setLoading(false);
    }
  }, [user]);

  const approve = useCallback(async (testimonialId: string) => {
    if (!user || user.id !== userId) return;

    try {
      const { error } = await dbLoose
        .from('testimonials')
        .update({ is_approved: true })
        .eq('id', testimonialId)
        .eq('target_user_id', user.id);

      if (error) {
        logger.error('[useTestimonials] Ошибка одобрения', { testimonialId, error });
        toast.error('Не удалось одобрить');
        return;
      }

      toast.success('Рекомендация одобрена');
      await loadTestimonials();
    } catch (err) {
      logger.error('[useTestimonials] Ошибка одобрения', { error: err });
    }
  }, [user, userId, loadTestimonials]);

  const reject = useCallback(async (testimonialId: string) => {
    if (!user || user.id !== userId) return;

    try {
      const { error } = await dbLoose
        .from('testimonials')
        .delete()
        .eq('id', testimonialId)
        .eq('target_user_id', user.id);

      if (error) {
        logger.error('[useTestimonials] Ошибка отклонения', { testimonialId, error });
        toast.error('Не удалось отклонить');
        return;
      }

      toast.success('Рекомендация удалена');
      await loadTestimonials();
    } catch (err) {
      logger.error('[useTestimonials] Ошибка отклонения', { error: err });
    }
  }, [user, userId, loadTestimonials]);

  return { testimonials, pendingTestimonials, writeTestimonial, approve, reject, loading } as const;
}
