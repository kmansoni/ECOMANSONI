/**
 * CampaignStatsCard — карточка статистики рекламной кампании.
 *
 * Показывает: Impressions / Clicks / CTR / CPC / Spent
 */
import { useState, useEffect } from "react";
import { BarChart3, Eye, MousePointerClick, TrendingUp, DollarSign } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { CampaignStats } from "@/hooks/useAdCampaigns";

interface CampaignStatsCardProps {
  campaignId: string;
  spentCents: number;
  getStats: (id: string) => Promise<CampaignStats | null>;
}

function formatCurrency(cents: number): string {
  return `${(cents / 100).toFixed(2)} ₽`;
}

export function CampaignStatsCard({ campaignId, spentCents, getStats }: CampaignStatsCardProps) {
  const [stats, setStats] = useState<CampaignStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    getStats(campaignId).then((result) => {
      if (cancelled) return;
      setStats(result);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [campaignId, getStats]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center text-muted-foreground py-4">
        <BarChart3 className="w-8 h-8 mx-auto opacity-50 mb-1" />
        <p className="text-sm">Статистика недоступна</p>
      </div>
    );
  }

  const metrics = [
    { icon: Eye, label: "Показы", value: stats.impressions.toLocaleString("ru-RU") },
    { icon: MousePointerClick, label: "Клики", value: stats.clicks.toLocaleString("ru-RU") },
    { icon: TrendingUp, label: "CTR", value: `${stats.ctr}%` },
    { icon: DollarSign, label: "CPC", value: formatCurrency(stats.cpc) },
    { icon: BarChart3, label: "Расход", value: formatCurrency(spentCents) },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {metrics.map(({ icon: Icon, label, value }) => (
        <div
          key={label}
          className="flex flex-col items-center gap-1 p-3 rounded-xl bg-muted/50 dark:bg-muted/20"
        >
          <Icon className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{label}</span>
          <span className="text-sm font-semibold">{value}</span>
        </div>
      ))}
    </div>
  );
}
