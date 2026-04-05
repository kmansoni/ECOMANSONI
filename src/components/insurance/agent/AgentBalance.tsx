import { motion } from "framer-motion";
import { Wallet, Clock, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAgentBalance } from "@/hooks/insurance/useInsuranceAgent";
import { formatCurrency } from "@/lib/insurance/loyalty";

const cards = [
  { key: "available", label: "Доступно", icon: Wallet, cls: "text-green-400" },
  { key: "pending", label: "Ожидается", icon: Clock, cls: "text-orange-400" },
  { key: "totalEarned", label: "Всего заработано", icon: TrendingUp, cls: "text-blue-400" },
] as const;

export function AgentBalance({ onWithdrawClick }: { onWithdrawClick?: () => void }) {
  const { data, isLoading, error } = useAgentBalance();

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-6 text-center text-sm text-destructive">
          Не удалось загрузить баланс
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        {cards.map((c, i) => {
          const Icon = c.icon;
          const val = data[c.key];
          return (
            <motion.div
              key={c.key}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
            >
              <Card className="bg-card border-border">
                <CardContent className="p-4">
                  <Icon className={`w-4 h-4 mb-2 ${c.cls}`} />
                  <p className="text-lg font-bold text-foreground">{formatCurrency(val)}</p>
                  <p className="text-xs text-muted-foreground">{c.label}</p>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {data.available === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-2">Нет доступных средств</p>
      ) : (
        <Button
          className="w-full"
          disabled={data.available < 1000}
          onClick={onWithdrawClick}
        >
          Вывести средства
        </Button>
      )}
    </div>
  );
}
