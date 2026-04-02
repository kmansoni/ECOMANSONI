/**
 * CreatorEarningsPage — страница доходов от контента.
 *
 * Функциональность:
 * - Баланс: доступно / в обработке / выведено
 * - График доходов по месяцам
 * - Список транзакций
 * - Кнопка "Вывести средства"
 */
import { useState, useMemo } from "react";
import {
  Wallet,
  TrendingUp,
  Clock,
  CheckCircle2,
  ArrowLeft,
  DollarSign,
  ArrowDownCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useCreatorEarnings } from "@/hooks/useCreatorEarnings";
import type { EarningEntry, PayoutRequest } from "@/hooks/useCreatorEarnings";
import { PayoutRequestSheet } from "@/components/earnings/PayoutRequestSheet";
import { useNavigate } from "react-router-dom";

const SOURCE_LABELS: Record<string, string> = {
  ad_revenue: "Реклама",
  subscription: "Подписки",
  tip: "Чаевые",
  bonus: "Бонус",
  referral: "Реферал",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Ожидает",
  approved: "Одобрено",
  paid: "Выплачено",
  rejected: "Отклонено",
  processing: "Обработка",
  completed: "Завершено",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300",
  approved: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  paid: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
  processing: "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300",
  completed: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
};

function formatCurrency(cents: number): string {
  return `${(cents / 100).toFixed(2)} ₽`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function CreatorEarningsPage() {
  const navigate = useNavigate();
  const { summary, history, payoutRequests, loading } = useCreatorEarnings();
  const [payoutOpen, setPayoutOpen] = useState(false);

  const available = useMemo(() => summary.total - summary.paid, [summary]);

  // Простой «график»: доходы по месяцам за последние 6 мес
  const monthlyData = useMemo(() => {
    const months: Record<string, number> = {};
    const now = new Date();

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toLocaleDateString("ru-RU", { month: "short", year: "2-digit" });
      months[key] = 0;
    }

    for (const entry of history) {
      if (entry.status === "rejected") continue;
      const d = new Date(entry.created_at);
      const key = d.toLocaleDateString("ru-RU", { month: "short", year: "2-digit" });
      if (key in months) months[key] += entry.amount_cents;
    }

    return Object.entries(months);
  }, [history]);

  const maxMonthly = useMemo(() => {
    return Math.max(...monthlyData.map(([, v]) => v), 1);
  }, [monthlyData]);

  if (loading) {
    return (
      <div className="p-4 space-y-4 max-w-lg mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-lg border-b dark:border-gray-800 px-4 py-3">
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="min-h-[44px] min-w-[44px]"
            aria-label="Назад"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <Wallet className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-semibold flex-1">Доходы</h1>
          <Button
            size="sm"
            onClick={() => setPayoutOpen(true)}
            disabled={available < 1000}
            className="min-h-[44px]"
            aria-label="Вывести средства"
          >
            <ArrowDownCircle className="w-4 h-4" />
            Вывести
          </Button>
        </div>
      </header>

      <main className="flex-1 p-4 max-w-lg mx-auto w-full space-y-6">
        {/* Баланс */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { icon: DollarSign, label: "Доступно", value: formatCurrency(available), accent: true },
            { icon: Clock, label: "В ожидании", value: formatCurrency(summary.pending) },
            { icon: CheckCircle2, label: "Выведено", value: formatCurrency(summary.paid) },
            { icon: TrendingUp, label: "За месяц", value: formatCurrency(summary.thisMonth) },
          ].map(({ icon: Icon, label, value, accent }) => (
            <div
              key={label}
              className={`flex flex-col items-center gap-1 p-3 rounded-xl ${
                accent ? "bg-primary/10 dark:bg-primary/20" : "bg-muted/50 dark:bg-muted/20"
              }`}
            >
              <Icon className={`w-4 h-4 ${accent ? "text-primary" : "text-muted-foreground"}`} />
              <span className="text-xs text-muted-foreground">{label}</span>
              <span className={`text-sm font-semibold ${accent ? "text-primary" : ""}`}>{value}</span>
            </div>
          ))}
        </div>

        {/* Мини-график */}
        <div>
          <h3 className="text-sm font-medium mb-3">Доходы по месяцам</h3>
          <div className="flex items-end gap-2 h-24">
            {monthlyData.map(([month, cents]) => (
              <div key={month} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full bg-primary/20 rounded-t-md transition-all"
                  style={{ height: `${Math.max((cents / maxMonthly) * 80, 4)}px` }}
                >
                  <div
                    className="w-full bg-primary rounded-t-md transition-all"
                    style={{ height: `${Math.max((cents / maxMonthly) * 80, 2)}px` }}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground">{month}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Транзакции */}
        <div>
          <h3 className="text-sm font-medium mb-3">История доходов</h3>
          {history.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <Wallet className="w-10 h-10 mx-auto opacity-50 mb-2" />
              <p className="text-sm">Пока нет доходов</p>
            </div>
          ) : (
            <div className="space-y-2">
              {history.slice(0, 30).map((entry: EarningEntry) => (
                <div
                  key={entry.id}
                  className="flex items-center gap-3 p-3 rounded-xl bg-card border dark:border-gray-800"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">
                      {SOURCE_LABELS[entry.source] ?? entry.source}
                    </p>
                    {entry.description && (
                      <p className="text-xs text-muted-foreground truncate">{entry.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground">{formatDate(entry.created_at)}</p>
                  </div>
                  <Badge className={STATUS_COLORS[entry.status]}>
                    {STATUS_LABELS[entry.status]}
                  </Badge>
                  <span className="text-sm font-semibold tabular-nums text-green-600 dark:text-green-400">
                    +{formatCurrency(entry.amount_cents)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Запросы на выплату */}
        {payoutRequests.length > 0 && (
          <div>
            <h3 className="text-sm font-medium mb-3">Запросы на выплату</h3>
            <div className="space-y-2">
              {payoutRequests.map((req: PayoutRequest) => (
                <div
                  key={req.id}
                  className="flex items-center gap-3 p-3 rounded-xl bg-card border dark:border-gray-800"
                >
                  <ArrowDownCircle className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{formatCurrency(req.amount_cents)}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(req.created_at)}</p>
                  </div>
                  <Badge className={STATUS_COLORS[req.status]}>
                    {STATUS_LABELS[req.status]}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <PayoutRequestSheet open={payoutOpen} onOpenChange={setPayoutOpen} />
    </div>
  );
}
