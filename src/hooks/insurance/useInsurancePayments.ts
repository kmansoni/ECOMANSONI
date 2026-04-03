/**
 * useInsurancePayments — хук для работы с платежами за полисы (insurance_payments).
 *
 * - paymentHistory — список платежей текущего пользователя
 * - createPayment(policyId, amount, method) — создание платежа
 * - paymentTotal — общая сумма завершённых платежей
 */

import { useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { dbLoose } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { logger } from '@/lib/logger';

const QUERY_KEY = ['insurance-payments'] as const;
const PAGE_LIMIT = 50;

export type PaymentStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'refunded';

export interface InsurancePaymentRow {
  id: string;
  policy_id: string;
  user_id: string;
  amount: number;
  status: PaymentStatus;
  payment_method: string | null;
  external_id: string | null;
  created_at: string;
  completed_at: string | null;
}

export function useInsurancePayments() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // ---------- История платежей ----------
  const {
    data: paymentHistory,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: [...QUERY_KEY, user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await dbLoose
        .from('insurance_payments')
        .select('id, policy_id, user_id, amount, status, payment_method, external_id, created_at, completed_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(PAGE_LIMIT);

      if (error) {
        logger.error('[useInsurancePayments] Ошибка загрузки платежей', { error });
        throw error;
      }

      return (data ?? []) as unknown as InsurancePaymentRow[];
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  // ---------- Общая сумма завершённых платежей ----------
  const paymentTotal = useMemo(() => {
    if (!paymentHistory) return 0;
    return paymentHistory
      .filter((p) => p.status === 'completed')
      .reduce((sum, p) => sum + p.amount, 0);
  }, [paymentHistory]);

  // ---------- Создание платежа ----------
  const createPaymentMutation = useMutation({
    mutationFn: async ({
      policyId,
      amount,
      method,
    }: {
      policyId: string;
      amount: number;
      method: string;
    }) => {
      if (!user) throw new Error('Требуется авторизация');

      const { data, error } = await dbLoose
        .from('insurance_payments')
        .insert({
          policy_id: policyId,
          user_id: user.id,
          amount,
          payment_method: method,
          status: 'pending',
        })
        .select('id')
        .single();

      if (error) {
        logger.error('[useInsurancePayments] Ошибка создания платежа', { error, policyId, amount });
        throw error;
      }

      return data as unknown as { id: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEY] });
      toast.success('Платёж создан');
    },
    onError: () => {
      toast.error('Не удалось создать платёж');
    },
  });

  const createPayment = useCallback(
    (policyId: string, amount: number, method: string) =>
      createPaymentMutation.mutateAsync({ policyId, amount, method }),
    [createPaymentMutation],
  );

  return {
    paymentHistory: paymentHistory ?? [],
    paymentTotal,
    isLoading,
    error,
    refetch,
    createPayment,
    isCreating: createPaymentMutation.isPending,
  };
}
