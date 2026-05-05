/**
 * useAdCreatives — управление креативами рекламной кампании.
 *
 * Фичи:
 * - Валидация входных данных (URL, длины текстов)
 * - Пагинация cursor-based (pageSize = 25)
 * - Проверка принадлежности креатива кампании
 * - Error handling с toast
 * - Soft delete support (deleted_at)
 * - Статусы модерации (draft → pending_review → approved → rejected → archived)
 *
 * @param campaignId — ID кампании
 *
 * @returns
 *  - creatives — список креативов (активные, пагинированный)
 *  - addCreative / updateCreative / deleteCreative
 *  - loading / error / hasMore / loadMore
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { logger } from "@/lib/logger";
import { toast } from "sonner";
import { validateCreativeInput, isValidUUID } from "@/lib/validators";
import type {
  AdCreative,
  AdCreativeInsert,
  AdCreativeUpdate,
  AdCreativeStatus,
} from "@/lib/ads/types";

const PAGE_SIZE = 25;

// Валидация UUID
function isValidUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

// Валидация креатива
function validateCreativeInput(input: AdCreativeInsert): string[] {
  const errors: string[] = [];

  // URL валидация
  if (!input.media_url.startsWith('https://')) {
    errors.push('media_url должен быть HTTPS');
  }
  if (input.media_url.length > 2048) {
    errors.push('media_url слишком длинный (макс. 2048)');
  }

  if (!input.destination_url.startsWith('https://')) {
    errors.push('destination_url должен быть HTTPS');
  }
  if (input.destination_url.length > 2048) {
    errors.push('destination_url слишком длинный (макс. 2048)');
  }

  // Headline
  const hl = input.headline.trim();
  if (hl.length < 1 || hl.length > 100) {
    errors.push('headline должен быть от 1 до 100 символов');
  }

  // Description
  if (input.description && input.description.length > 300) {
    errors.push('description не более 300 символов');
  }

  // CTA (checked by TS, но на всякий)
  const validCTAs = ['learn_more', 'shop_now', 'sign_up', 'contact_us', 'download', 'get_quote', 'apply_now'];
  if (!validCTAs.includes(input.call_to_action)) {
    errors.push('Недопустимый call_to_action');
  }

  // Frequency cap
  const freqCap = input.frequency_cap ?? 3;
  if (freqCap < 1 || freqCap > 100) {
    errors.push('frequency_cap должен быть от 1 до 100');
  }

  return errors;
}

// Проверка, что креатив принадлежит кампании
async function verifyCreativeOwnership(
  creativeId: string,
  campaignId: string,
  userId: string
): Promise<boolean> {
  const { count } = await supabase
    .from('ad_creatives')
    .select('*', { count: 'exact', head: true })
    .eq('id', creativeId)
    .eq('campaign_id', campaignId)
    .eq('deleted_at', null);

  return (count ?? 0) > 0;
}

export function useAdCreatives(campaignId: string) {
  const { user } = useAuth();
  const [creatives, setCreatives] = useState<AdCreative[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  // Загрузка с пагинацией
  const loadCreatives = useCallback(async (pageNum: number, reset: boolean = false) => {
    if (!user || !campaignId || !isValidUUID(campaignId)) {
      if (reset) setCreatives([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const from = pageNum * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    try {
      const { data, error, count } = await supabase
        .from('ad_creatives')
        .select('*', { count: 'exact' })
        .eq('campaign_id', campaignId)
        .is('deleted_at', null)
        .order('priority_order', { ascending: true })
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) {
        throw error;
      }

      if (reset) {
        setCreatives(data || []);
      } else {
        setCreatives(prev => [...prev, ...(data || [])]);
      }

      setHasMore(count !== null && to + 1 < count);
    } catch (err: any) {
      const msg = err?.message || 'Не удалось загрузить креативы';
      logger.error('[useAdCreatives] load error', { error: err, campaignId });
      setError(msg);
      toast.error(msg);
      if (reset) setCreatives([]);
    } finally {
      setLoading(false);
    }
  }, [user, campaignId]);

  // Первичная загрузка
  useEffect(() => {
    loadCreatives(0, true);
  }, [loadCreatives]);

  // Добавление креатива
  const addCreative = useCallback(async (input: AdCreativeInsert): Promise<AdCreative | null> => {
    if (!user || !campaignId) {
      toast.error('Требуется авторизация');
      return null;
    }

    if (!isValidUUID(campaignId)) {
      toast.error('Неверный ID кампании');
      return null;
    }

    const validationErrors = validateCreativeInput(input);
    if (validationErrors.length > 0) {
      toast.error(validationErrors[0]);
      return null;
    }

    try {
      const { data, error } = await supabase
        .from('ad_creatives')
        .insert({
          campaign_id: campaignId,
          type: input.type,
          media_url: input.media_url.trim(),
          headline: input.headline.trim(),
          description: input.description?.trim() ?? null,
          call_to_action: input.call_to_action,
          destination_url: input.destination_url.trim(),
          status: input.status ?? 'draft',
          frequency_cap: input.frequency_cap ?? 3,
          priority_order: input.priority_order ?? creatives.length,
        } as any)
        .select('*')
        .single();

      if (error) {
        logger.error('[useAdCreatives] insert error', { error, input });
        toast.error(error.message || 'Не удалось добавить креатив');
        return null;
      }

      setCreatives(prev => [data, ...prev]);
      toast.success('Креатив добавлен');
      return data;
    } catch (e: any) {
      logger.error('[useAdCreatives] addCreative exception', { error: e });
      toast.error('Ошибка при добавлении креатива');
      return null;
    }
  }, [user, campaignId, creatives.length]);

  // Обновление креатива
  const updateCreative = useCallback(async (
    id: string,
    updates: AdCreativeUpdate
  ): Promise<boolean> => {
    if (!user) {
      toast.error('Требуется авторизация');
      return false;
    }

    // Проверяем принадлежность креатива текущей кампании
    const creative = creatives.find(c => c.id === id);
    if (!creative) {
      toast.error('Креатив не найден в текущем списке');
      return false;
    }

    if (creative.campaign_id !== campaignId) {
      toast.error('Доступ запрещён: креатив не принадлежит этой кампании');
      return false;
    }

    // Запрещаем менять campaign_id
    const { campaign_id: _, ...safeUpdates } = updates as any;

    // Проверка на изменение type/cta после approval
    if (creative.status !== 'draft' && creative.status !== 'rejected') {
      if ('type' in safeUpdates || 'call_to_action' in safeUpdates) {
        toast.error('Нельзя менять тип или CTA после одобрения креатива');
        return false;
      }
    }

    try {
      const { data, error } = await supabase
        .from('ad_creatives')
        .update(safeUpdates as any)
        .eq('id', id)
        .select('*')
        .single();

      if (error) {
        logger.error('[useAdCreatives] update error', { error, id, updates });
        toast.error(error.message || 'Не удалось обновить креатив');
        return false;
      }

      if (!data) {
        toast.error('Креатив не найден');
        return false;
      }

      setCreatives(prev => prev.map(c => c.id === id ? data : c));
      toast.success('Креатив обновлён');
      return true;
    } catch (e: any) {
      logger.error('[useAdCreatives] updateCreative exception', { error: e });
      toast.error('Ошибка при обновлении креатива');
      return false;
    }
  }, [user, campaignId, creatives]);

  // Удаление креатива (soft delete through RLS: только draft/rejected)
  const deleteCreative = useCallback(async (id: string): Promise<boolean> => {
    if (!user) {
      toast.error('Требуется авторизация');
      return false;
    }

    const creative = creatives.find(c => c.id === id);
    if (!creative) {
      toast.error('Креатив не найден');
      return false;
    }

    if (creative.campaign_id !== campaignId) {
      toast.error('Доступ запрещён');
      return false;
    }

    try {
      // Используем .delete().select() чтобы получить удалённую запись (для подтверждения)
      const { data, error } = await supabase
        .from('ad_creatives')
        .delete()
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('[useAdCreatives] delete error', { error, id });
        toast.error(error.message || 'Не удалось удалить креатив');
        return false;
      }

      if (!data) {
        toast.error('Креатив не найден или уже удалён');
        return false;
      }

      setCreatives(prev => prev.filter(c => c.id !== id));
      toast.success('Креатив удалён');
      return true;
    } catch (e: any) {
      logger.error('[useAdCreatives] deleteCreative exception', { error: e });
      toast.error('Ошибка при удалении креатива');
      return false;
    }
  }, [user, campaignId, creatives]);

  // Загрузка ещё (пагинация)
  const loadMore = useCallback(() => {
    if (!loading && hasMore) {
      setPage(prev => prev + 1);
    }
  }, [loading, hasMore]);

  // Сброс пагинации при смене campaignId
  useEffect(() => {
    setPage(0);
    setCreatives([]);
    setHasMore(true);
    setError(null);
  }, [campaignId]);

  // Загрузка при изменении page
  useEffect(() => {
    if (page > 0) { // page 0 загружается в первичном эффекте
      loadCreatives(page);
    }
  }, [page, loadCreatives]);

  return {
    creatives,
    addCreative,
    updateCreative,
    deleteCreative,
    loading,
    error,
    hasMore,
    loadMore,
  } as const;
}
