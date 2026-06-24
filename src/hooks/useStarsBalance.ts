import { useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";

export function useStarsBalance(userId?: string) {
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchBalance = useCallback(async () => {
    if (!userId) return null;
    
    setLoading(true);
    const { data } = await supabase
      .from("telegram_stars_balances")
      .select("balance")
      .eq("user_id", userId)
      .single();
    
    if (data) setBalance(data.balance);
    setLoading(false);
    return data?.balance;
  }, [userId]);

  const purchaseStars = useCallback(async (amount: number) => {
    const { data, error } = await supabase.functions.invoke("stars-balance/purchase", {
      body: { amount }
    });
    
    if (!error && data?.ok) {
      setBalance(prev => (prev ?? 0) + amount);
    }
    
    return { ok: !error, error, balance: data?.balance };
  }, [supabase]);

  return {
    balance,
    loading,
    fetchBalance,
    purchaseStars,
  };
}