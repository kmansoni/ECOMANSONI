import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { AgentBalanceInfo } from '@/types/insurance';
import { logger } from '@/lib/logger';
import { toast } from 'sonner';

async function callBalance(action: string, payload?: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('insurance-agent-balance', {
    body: { action, ...payload },
  });
  if (error) throw new Error(error.message || 'Ошибка запроса');
  if (data?.error) throw new Error(data.error);
  return data;
}

export function useAgentBalance() {
  return useQuery<AgentBalanceInfo>({
    queryKey: ['insurance', 'agent-balance'],
    queryFn: () => callBalance('get_balance'),
    staleTime: 30_000,
    retry: 1,
  });
}

interface TransactionItem {
  id: string;
  amount: number;
  status: string;
  created_at: string;
  kind: 'commission' | 'payout';
  rate?: number;
  payment_method?: string;
}

export function useAgentTransactions(period = 'month') {
  return useQuery<{ items: TransactionItem[]; total: number }>({
    queryKey: ['insurance', 'agent-transactions', period],
    queryFn: () => callBalance('get_history', { period }),
    staleTime: 60_000,
  });
}

export function useRequestWithdrawal() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (params: { amount: number; paymentMethod: string }) =>
      callBalance('request_withdrawal', params),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['insurance', 'agent-balance'] });
      qc.invalidateQueries({ queryKey: ['insurance', 'agent-transactions'] });
      toast.success('Заявка на вывод создана');
    },
    onError: (err: Error) => {
      logger.error('[useRequestWithdrawal] ошибка', { msg: err.message });
      toast.error(err.message || 'Не удалось создать заявку');
    },
  });
}
