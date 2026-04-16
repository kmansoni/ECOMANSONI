/**
 * useDating — хук для свайп-знакомств.
 *
 * - cards: кандидаты (отфильтрованные по уже свайпнутым)
 * - swipe: лайк/дизлайк/суперлайк → проверка на match
 * - matches: список мэтчей
 * - myProfile / updateProfile: управление анкетой
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { dbLoose } from "@/lib/supabase";

export interface DatingProfile {
  id: string;
  user_id: string;
  bio: string | null;
  photos: string[];
  age: number;
  gender: string;
  interests: string[];
  display_name?: string;
  distance_km?: number;
}

export interface DatingMatch {
  id: string;
  user1_id: string;
  user2_id: string;
  matched_at: string;
  is_active: boolean;
  partner?: DatingProfile;
}

interface SwipeResult {
  matched: boolean;
  matchId?: string;
}

interface DatingFiltersState {
  minAge: number;
  maxAge: number;
  maxDistance: number;
  gender: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useDating() {
  const { user } = useAuth();
  const [cards, setCards] = useState<DatingProfile[]>([]);
  const [matches, setMatches] = useState<DatingMatch[]>([]);
  const [myProfile, setMyProfile] = useState<DatingProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<DatingFiltersState>({
    minAge: 18,
    maxAge: 100,
    maxDistance: 50,
    gender: null,
  });

  const swipedIdsRef = useRef<Set<string>>(new Set());

  // Загрузить свой профиль знакомств
  const loadMyProfile = useCallback(async () => {
    if (!user) return;

    const { data, error } = await dbLoose.from('dating_profiles')
      .select('id, user_id, bio, photos, age, gender, interests, max_distance_km, min_age, max_age, is_active')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      logger.error('[useDating] Ошибка загрузки профиля', { error });
      return;
    }

    if (data) {
      setMyProfile(data);
      setFilters({
        minAge: data.min_age ?? 18,
        maxAge: data.max_age ?? 100,
        maxDistance: data.max_distance_km ?? 50,
        gender: null,
      });
    }
  }, [user]);

  // Загрузить уже свайпнутые ID
  const loadSwipedIds = useCallback(async () => {
    if (!user) return;

    const { data } = await dbLoose.from('dating_swipes')
      .select('swiped_id')
      .eq('swiper_id', user.id)
      .limit(1000);

    if (data) {
      swipedIdsRef.current = new Set(data.map(d => d.swiped_id));
    }
  }, [user]);

  // Загрузить кандидатов
  const loadCards = useCallback(async () => {
    if (!user) return;

    const { data, error } = await dbLoose.from('dating_profiles')
      .select('id, user_id, bio, photos, age, gender, interests')
      .eq('is_active', true)
      .neq('user_id', user.id)
      .gte('age', filters.minAge)
      .lte('age', filters.maxAge)
      .order('last_active', { ascending: false })
      .limit(50);

    if (error) {
      logger.error('[useDating] Ошибка загрузки карточек', { error });
      return;
    }

    // Фильтруем уже свайпнутых на клиенте
    const filtered = (data ?? []).filter(p => !swipedIdsRef.current.has(p.user_id));

    // Фильтр по полу
    const byGender = filters.gender
      ? filtered.filter(p => p.gender === filters.gender)
      : filtered;

    setCards(byGender);
  }, [user, filters]);

  // Загрузить мэтчи
  const loadMatches = useCallback(async () => {
    if (!user) return;

    const { data, error } = await dbLoose.from('dating_matches')
      .select('id, user1_id, user2_id, matched_at, is_active')
      .eq('is_active', true)
      .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
      .order('matched_at', { ascending: false })
      .limit(50);

    if (error) {
      logger.error('[useDating] Ошибка загрузки мэтчей', { error });
      return;
    }

    setMatches(data ?? []);
  }, [user]);

  // Инициализация
  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    setLoading(true);

    async function init() {
      await Promise.all([loadMyProfile(), loadSwipedIds()]);
      if (!cancelled) {
        await Promise.all([loadCards(), loadMatches()]);
        setLoading(false);
      }
    }

    void init();
    return () => { cancelled = true; };
  }, [user, loadMyProfile, loadSwipedIds, loadCards, loadMatches]);

  // Свайп
  const swipe = useCallback(async (
    targetUserId: string,
    direction: 'like' | 'dislike' | 'superlike',
  ): Promise<SwipeResult> => {
    if (!user) return { matched: false };

    // Оптимистичное удаление из стека
    setCards(prev => prev.filter(c => c.user_id !== targetUserId));
    swipedIdsRef.current.add(targetUserId);

    const { error } = await dbLoose.from('dating_swipes')
      .insert({
        swiper_id: user.id,
        swiped_id: targetUserId,
        direction,
      });

    if (error) {
      logger.error('[useDating] Ошибка свайпа', { error });
      toast.error('Не удалось записать выбор');
      return { matched: false };
    }

    // Проверить, есть ли мэтч (trigger создаёт запись автоматически)
    if (direction === 'like' || direction === 'superlike') {
      const { data: matchData } = await dbLoose.from('dating_matches')
        .select('id')
        .or(`and(user1_id.eq.${LEAST(user.id, targetUserId)},user2_id.eq.${GREATEST(user.id, targetUserId)})`)
        .maybeSingle();

      if (matchData) {
        await loadMatches();
        return { matched: true, matchId: matchData.id };
      }
    }

    return { matched: false };
  }, [user, loadMatches]);

  // Обновить профиль знакомств
  const updateProfile = useCallback(async (updates: Partial<DatingProfile> & {
    min_age?: number;
    max_age?: number;
    max_distance_km?: number;
  }) => {
    if (!user) return;

    const { data, error } = await dbLoose.from('dating_profiles')
      .upsert({
        user_id: user.id,
        ...updates,
        last_active: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      logger.error('[useDating] Ошибка обновления профиля', { error });
      toast.error('Не удалось обновить профиль');
      return;
    }

    if (data) {
      setMyProfile(data);
      toast.success('Профиль обновлён');
    }
  }, [user]);

  // Обновить фильтры
  const updateFilters = useCallback((newFilters: Partial<DatingFiltersState>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  }, []);

  // Перезагрузка карточек при смене фильтров
  useEffect(() => {
    if (user && !loading) {
      void loadCards();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  return {
    cards,
    swipe,
    matches,
    myProfile,
    updateProfile,
    filters,
    updateFilters,
    loading,
    refreshCards: loadCards,
  };
}

// Вспомогательные: сортировка UUID для уникального ключа пары
function LEAST(a: string, b: string): string {
  return a < b ? a : b;
}
function GREATEST(a: string, b: string): string {
  return a > b ? a : b;
}
