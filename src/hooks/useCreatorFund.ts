import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface CreatorFundAccount {
  id: string;
  user_id: string;
  balance: number;
  total_earned: number;
  is_eligible: boolean;
  min_followers_required: number;
  created_at: string;
}

export interface CreatorFundPayout {
  id: string;
  user_id: string;
  amount: number;
  method: string;
  status: string;
  created_at: string;
}

export interface DailyEarning {
  earning_date: string;
  views_count: number;
  engagement_count: number;
  amount: number;
}

export function useCreatorFund() {
  const { user } = useAuth();
  const [account, setAccount] = useState<CreatorFundAccount | null>(null);
  const [payouts, setPayouts] = useState<CreatorFundPayout[]>([]);
  const [earnings, setEarnings] = useState<DailyEarning[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    setLoading(true);

    Promise.all([
      (supabase as any)
        .from('creator_fund_accounts')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle(),
      (supabase as any)
        .from('creator_fund_payouts')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      (supabase as any)
        .from('creator_fund_daily_earnings')
        .select('*')
        .eq('user_id', user.id)
        .order('earning_date', { ascending: false })
        .limit(90),
    ]).then(([accRes, payRes, earnRes]) => {
      setAccount(accRes.data ?? null);
      setPayouts(payRes.data ?? []);
      setEarnings(earnRes.data ?? []);
    }).finally(() => setLoading(false));
  }, [user]);

  const balance = account?.balance ?? 0;
  const totalEarned = account?.total_earned ?? 0;
  const isEligible = account?.is_eligible ?? false;

  const requestPayout = useCallback(
    async (amount: number, method: string) => {
      if (!user) throw new Error('Not authenticated');
      if (amount > balance) throw new Error('Недостаточно средств');
      if (amount < 500) throw new Error('Минимальная сумма выплаты — 500 ₽');

      const { data, error } = await (supabase as any)
        .from('creator_fund_payouts')
        .insert({ user_id: user.id, amount, method, status: 'pending' })
        .select()
        .single();
      if (error) throw error;
      setPayouts(prev => [data, ...prev]);

      // Update balance optimistically
      if (account) {
        setAccount(prev => prev ? { ...prev, balance: prev.balance - amount } : prev);
      }

      return data as CreatorFundPayout;
    },
    [user, balance, account]
  );

  return {
    account,
    balance,
    totalEarned,
    isEligible,
    payouts,
    earnings,
    loading,
    requestPayout,
  };
}
