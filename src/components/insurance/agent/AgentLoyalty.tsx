import { motion } from "framer-motion";
import { Star, History } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAgentBalance } from "@/hooks/insurance/useInsuranceAgent";
import { LOYALTY_LEVELS, formatCurrency, getLoyaltyProgress } from "@/lib/insurance/loyalty";
import { getLoyaltyInfo } from "@/types/insurance";
import { supabase, dbLoose } from "@/lib/supabase";

interface LoyaltyHistoryItem {
  id: string;
  quarter: string;
  level_before: string;
  level_after: string;
  premiums_total: number;
  bonus_percent: number;
  calculated_at: string | null;
}

const levelColors: Record<string, string> = {
  novice: "#9ca3af",
  agent: "#3b82f6",
  agent2: "#8b5cf6",
  authorized: "#f59e0b",
  authorized_plus: "#ef4444",
};

export function AgentLoyalty() {
  const { data, isLoading, error } = useAgentBalance();

  // Загрузка истории лояльности
  const { data: history = [] } = useQuery<LoyaltyHistoryItem[]>({
    queryKey: ["insurance", "loyalty-history"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data: profile } = await dbLoose
        .from("agent_profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();
      if (!profile) return [];

      const agentId = (profile as any).id;

      const { data: historyData, error } = await dbLoose
        .from("insurance_loyalty_history")
        .select("*")
        .eq("agent_id", agentId)
        .order("calculated_at", { ascending: false })
        .limit(8);

      if (error) return [];
      return (historyData ?? []) as unknown as LoyaltyHistoryItem[];
    },
    staleTime: 120_000,
  });

  if (isLoading) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-6 space-y-4">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-6 text-center text-sm text-destructive">
          Не удалось загрузить информацию о лояльности
        </CardContent>
      </Card>
    );
  }

  const info = getLoyaltyInfo(data.loyaltyLevel);
  const progress = getLoyaltyProgress(data.loyaltyLevel, data.quarterlyPremiums);
  const color = levelColors[data.loyaltyLevel] ?? "#9ca3af";
  const passedIdx = LOYALTY_LEVELS.findIndex(l => l.level === data.loyaltyLevel);

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Star className="w-4 h-4" style={{ color }} />
            {info.name}
          </CardTitle>
          <span className="text-sm font-medium" style={{ color }}>
            Бонус +{data.loyaltyBonus}%
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* прогресс-бар */}
        <div>
          <div className="h-3 rounded-full bg-muted overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: color }}
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            />
          </div>
          {data.nextLevelName ? (
            <p className="text-xs text-muted-foreground mt-1.5">
              {formatCurrency(data.quarterlyPremiums)} / {formatCurrency(data.nextLevelThreshold ?? 0)}{" "}
              до «{data.nextLevelName}»
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-1.5">Максимальный уровень достигнут</p>
          )}
        </div>

        {/* список уровней */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Все уровни</p>
          {LOYALTY_LEVELS.map((lvl, i) => {
            const passed = i <= passedIdx;
            const current = i === passedIdx;
            const c = levelColors[lvl.level] ?? "#9ca3af";
            return (
              <div
                key={lvl.level}
                className={`flex items-center gap-3 text-sm rounded-lg px-3 py-1.5 ${
                  current ? "bg-muted/50" : ""
                }`}
              >
                <span style={{ color: c }} className="text-base leading-none">
                  {passed ? "\u25cf" : "\u25cb"}
                </span>
                <span className={`flex-1 ${current ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                  {lvl.name}
                </span>
                <span className="text-xs text-muted-foreground w-20 text-right">
                  {formatCurrency(lvl.threshold)}
                </span>
                <span className="text-xs w-8 text-right" style={{ color: c }}>
                  +{lvl.bonus}%
                </span>
              </div>
            );
          })}
        </div>

        {/* история лояльности */}
        {history.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <History className="w-3.5 h-3.5" /> История уровней
            </p>
            {history.map(h => {
              const beforeInfo = getLoyaltyInfo(h.level_before as any);
              const afterInfo = getLoyaltyInfo(h.level_after as any);
              const changed = h.level_before !== h.level_after;
              return (
                <div key={h.id} className="flex items-center justify-between text-xs py-1 border-b border-border/50 last:border-0">
                  <span className="text-muted-foreground">{h.quarter}</span>
                  <span className={changed ? "text-foreground font-medium" : "text-muted-foreground"}>
                    {changed ? `${beforeInfo.name} \u2192 ${afterInfo.name}` : afterInfo.name}
                  </span>
                  <span className="text-muted-foreground">{formatCurrency(h.premiums_total)}</span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
