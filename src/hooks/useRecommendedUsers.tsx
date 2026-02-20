import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface RecommendedUser {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  verified: boolean;
  followers_count: number;
  is_from_contacts: boolean;
}

export function useRecommendedUsers(limit: number = 10) {
  const { user } = useAuth();
  const [users, setUsers] = useState<RecommendedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRecommendedUsers = useCallback(async () => {
    if (!user?.id) {
      setUsers([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Вызываем функцию из БД с user_id
      const { data, error: fetchError } = await (supabase as any)
        .rpc('get_recommended_users_for_new_user', { 
          p_user_id: user.id,
          limit_count: limit 
        });

      if (fetchError) throw fetchError;

      setUsers((data || []) as RecommendedUser[]);
    } catch (err) {
      console.error('Error fetching recommended users:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch recommended users');
    } finally {
      setLoading(false);
    }
  }, [user?.id, limit]);

  // Функция для сохранения контактов
  const saveContacts = useCallback(async (phoneNumbers: string[]) => {
    if (!user?.id) return;

    try {
      await (supabase as any).rpc('save_user_contacts', {
        p_user_id: user.id,
        p_contacts_phones: phoneNumbers
      });
      
      // Перезагружаем рекомендации после сохранения контактов
      await fetchRecommendedUsers();
    } catch (err) {
      console.error('Error saving contacts:', err);
      throw err;
    }
  }, [user?.id, fetchRecommendedUsers]);

  // Функция для отзыва доступа к контактам
  const revokeContactsAccess = useCallback(async () => {
    if (!user?.id) return;

    try {
      await (supabase as any).rpc('revoke_contacts_access', {
        p_user_id: user.id
      });
      
      // Перезагружаем рекомендации после отзыва доступа
      await fetchRecommendedUsers();
    } catch (err) {
      console.error('Error revoking contacts access:', err);
      throw err;
    }
  }, [user?.id, fetchRecommendedUsers]);

  useEffect(() => {
    fetchRecommendedUsers();
  }, [fetchRecommendedUsers]);

  return {
    users,
    loading,
    error,
    refetch: fetchRecommendedUsers,
    saveContacts,
    revokeContactsAccess
  };
}
