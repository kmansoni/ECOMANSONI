import { useState, useEffect } from "react";
import { createClient } from "@/integrations/supabase/client";

interface StarsBalanceDisplayProps {
  userId?: string;
  onBalanceChange?: (balance: number) => void;
}

export function StarsBalanceDisplay({ userId, onBalanceChange }: StarsBalanceDisplayProps) {
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    if (!userId) return;
    
    const fetchBalance = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("telegram_stars_balances")
        .select("balance")
        .eq("user_id", userId)
        .single();
      
      if (data) {
        setBalance(data.balance);
        onBalanceChange?.(data.balance);
      }
      setLoading(false);
    };

    fetchBalance();

    const channel = supabase
      .channel(`stars-balance:${userId}`)
      .on("postgres_changes", { 
        event: "UPDATE", 
        schema: "public", 
        table: "telegram_stars_balances",
        filter: `user_id=eq.${userId}`
      }, (payload) => {
        setBalance((payload.new as any).balance);
        onBalanceChange?.((payload.new as any).balance);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId, supabase, onBalanceChange]);

  if (loading) return <div className="text-sm text-muted-foreground">Загрузка...</div>;

  return (
    <div className="flex items-center gap-2">
      <span className="text-2xl">⭐</span>
      <span className="font-mono font-bold">{balance?.toLocaleString() ?? 0}</span>
    </div>
  );
}