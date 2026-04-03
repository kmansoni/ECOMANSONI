/**
 * useInsurancePoliciesDB — хук для работы с полисами из insurance_policies (БД).
 *
 * Заменяет mock-данные из insuranceApi реальными запросами к Supabase.
 * - policies — список полисов текущего пользователя
 * - createPolicy(data) — создание полиса (draft)
 * - updatePolicyStatus(id, status) — смена статуса
 * - expiringPolicies — полисы, истекающие в ближайшие 30 дней
 */

import { useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { dbLoose } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { logger } from '@/lib/logger';

const QUERY_KEY = ['insurance-policies-db'] as const;
const EXPIRING_THRESHOLD_DAYS = 30;
const PAGE_LIMIT = 50;

export interface InsurancePolicyRow {
  id: string;
  user_id: string;
  company_id: string;
  product_id: string | null;
  policy_number: string | null;
  type: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  premium_amount: number;
  coverage_amount: number | null;
  insured_object: Record<string, unknown>;
  documents: unknown[];
  created_at: string;
  paid_at: string | null;
}

type PolicyStatus = 'draft' | 'pending' | 'active' | 'expired' | 'cancelled';

interface CreatePolicyInput {
  company_id: string;
  product_id?: string;
  type: string;
  premium_amount: number;
  coverage_amount?: number;
  start_date?: string;
  end_date?: string;
  insured_object?: Record<string, unknown>;
}

export function useInsurancePoliciesDB() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // ---------- Список полисов ----------
  const {
    data: policies,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: [...QUERY_KEY, user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await dbLoose
        .from('insurance_policies')
        .select('id, user_id, company_id, product_id, policy_number, type, status, start_date, end_date, premium_amount, coverage_amount, insured_object, documents, created_at, paid_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(PAGE_LIMIT);

      if (error) {
        logger.error('[useInsurancePoliciesDB] Ошибка загрузки полисов', { error });
        throw error;
      }

      return (data ?? []) as unknown as InsurancePolicyRow[];
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  // ---------- Полисы, истекающие в ближайшие 30 дней ----------
  const expiringPolicies = useMemo(() => {
    if (!policies) return [];
    const now = new Date();
    const threshold = new Date(now.getTime() + EXPIRING_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);

    return policies.filter((p) => {
      if (p.status !== 'active' || !p.end_date) return false;
      const endDate = new Date(p.end_date);
      return endDate >= now && endDate <= threshold;
    });
  }, [policies]);

  // ---------- Создание полиса ----------
  const createPolicyMutation = useMutation({
    mutationFn: async (input: CreatePolicyInput) => {
      if (!user) throw new Error('Требуется авторизация');

      const { data, error } = await dbLoose
        .from('insurance_policies')
        .insert({
          user_id: user.id,
          company_id: input.company_id,
          product_id: input.product_id ?? null,
          type: input.type,
          premium_amount: input.premium_amount,
          coverage_amount: input.coverage_amount ?? null,
          start_date: input.start_date ?? null,
          end_date: input.end_date ?? null,
          insured_object: input.insured_object ?? {},
          status: 'draft',
        })
        .select('id')
        .single();

      if (error) {
        logger.error('[useInsurancePoliciesDB] Ошибка создания полиса', { error, input });
        throw error;
      }

      return data as unknown as { id: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEY] });
      toast.success('Полис создан');
    },
    onError: () => {
      toast.error('Не удалось создать полис');
    },
  });

  // ---------- Обновление статуса ----------
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: PolicyStatus }) => {
      if (!user) throw new Error('Требуется авторизация');

      const updatePayload: Record<string, unknown> = { status };
      if (status === 'active') {
        updatePayload.paid_at = new Date().toISOString();
      }

      const { error } = await dbLoose
        .from('insurance_policies')
        .update(updatePayload)
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) {
        logger.error('[useInsurancePoliciesDB] Ошибка обновления статуса', { error, id, status });
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEY] });
      toast.success('Статус полиса обновлён');
    },
    onError: () => {
      toast.error('Не удалось обновить статус полиса');
    },
  });

  const createPolicy = useCallback(
    (input: CreatePolicyInput) => createPolicyMutation.mutateAsync(input),
    [createPolicyMutation],
  );

  const updatePolicyStatus = useCallback(
    (id: string, status: PolicyStatus) => updateStatusMutation.mutateAsync({ id, status }),
    [updateStatusMutation],
  );

  return {
    policies: policies ?? [],
    expiringPolicies,
    isLoading,
    error,
    refetch,
    createPolicy,
    isCreating: createPolicyMutation.isPending,
    updatePolicyStatus,
    isUpdating: updateStatusMutation.isPending,
  };
}
