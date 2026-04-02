/**
 * AdManagerPage — страница рекламного кабинета.
 *
 * Функциональность:
 * - Список кампаний с метриками
 * - Фильтры: статус, дата
 * - Создание новой кампании
 */
import { useState, useMemo, useCallback } from "react";
import {
  Megaphone,
  Plus,
  Filter,
  Eye,
  MousePointerClick,
  ArrowLeft,
  Pause,
  Play,
  Send,
  MoreVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useAdCampaigns } from "@/hooks/useAdCampaigns";
import { CampaignStatsCard } from "@/components/ads/CampaignStatsCard";
import { CreateCampaignSheet } from "@/components/ads/CreateCampaignSheet";
import { useNavigate } from "react-router-dom";

const STATUS_LABELS: Record<string, string> = {
  draft: "Черновик",
  review: "На модерации",
  active: "Активна",
  paused: "На паузе",
  completed: "Завершена",
  rejected: "Отклонена",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  review: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  active: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  paused: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  completed: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

const STATUS_FILTERS = ["all", "draft", "review", "active", "paused", "completed", "rejected"] as const;

export default function AdManagerPage() {
  const navigate = useNavigate();
  const {
    campaigns,
    getCampaignStats,
    pauseCampaign,
    resumeCampaign,
    submitForReview,
    loading,
  } = useAdCampaigns();

  const [createOpen, setCreateOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (statusFilter === "all") return campaigns;
    return campaigns.filter((c) => c.status === statusFilter);
  }, [campaigns, statusFilter]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  if (loading) {
    return (
      <div className="p-4 space-y-4 max-w-2xl mx-auto">
        <Skeleton className="h-8 w-48" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-lg border-b dark:border-gray-800 px-4 py-3">
        <div className="flex items-center gap-3 max-w-2xl mx-auto">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="min-h-[44px] min-w-[44px]"
            aria-label="Назад"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <Megaphone className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-semibold flex-1">Рекламный кабинет</h1>
          <Button
            size="sm"
            onClick={() => setCreateOpen(true)}
            className="min-h-[44px]"
            aria-label="Создать кампанию"
          >
            <Plus className="w-4 h-4" />
            Создать
          </Button>
        </div>
      </header>

      <main className="flex-1 p-4 max-w-2xl mx-auto w-full">
        {/* Фильтры */}
        <div className="flex gap-2 overflow-x-auto pb-3 mb-4">
          {STATUS_FILTERS.map((f) => (
            <Button
              key={f}
              variant={statusFilter === f ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(f)}
              className="whitespace-nowrap min-h-[36px]"
              aria-pressed={statusFilter === f}
            >
              <Filter className="w-3 h-3 mr-1" />
              {f === "all" ? "Все" : STATUS_LABELS[f]}
            </Button>
          ))}
        </div>

        {/* Список кампаний */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-12 text-center text-muted-foreground">
            <Megaphone className="w-12 h-12 opacity-50" />
            <p>Нет кампаний</p>
            <Button size="sm" onClick={() => setCreateOpen(true)} aria-label="Создать первую кампанию">
              <Plus className="w-4 h-4" />
              Создать первую кампанию
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((campaign) => (
              <div
                key={campaign.id}
                className="rounded-xl border dark:border-gray-800 bg-card overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => toggleExpand(campaign.id)}
                  className="w-full p-4 text-left flex items-center gap-3 min-h-[44px]"
                  aria-expanded={expandedId === campaign.id}
                  aria-label={`Кампания ${campaign.name}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{campaign.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {campaign.start_date} — {campaign.end_date ?? "бессрочно"}
                    </p>
                  </div>
                  <Badge className={STATUS_COLORS[campaign.status]}>
                    {STATUS_LABELS[campaign.status]}
                  </Badge>
                  <span className="text-sm font-medium tabular-nums">
                    {(campaign.spent_cents / 100).toFixed(0)} / {(campaign.budget_cents / 100).toFixed(0)} ₽
                  </span>
                  <MoreVertical className="w-4 h-4 text-muted-foreground" />
                </button>

                {expandedId === campaign.id && (
                  <div className="px-4 pb-4 space-y-3 border-t dark:border-gray-800 pt-3">
                    <CampaignStatsCard
                      campaignId={campaign.id}
                      spentCents={campaign.spent_cents}
                      getStats={getCampaignStats}
                    />
                    <div className="flex gap-2 flex-wrap">
                      {campaign.status === "draft" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => submitForReview(campaign.id)}
                          className="min-h-[44px]"
                          aria-label="Отправить на модерацию"
                        >
                          <Send className="w-4 h-4" />
                          На модерацию
                        </Button>
                      )}
                      {campaign.status === "active" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => pauseCampaign(campaign.id)}
                          className="min-h-[44px]"
                          aria-label="Приостановить"
                        >
                          <Pause className="w-4 h-4" />
                          Пауза
                        </Button>
                      )}
                      {campaign.status === "paused" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => resumeCampaign(campaign.id)}
                          className="min-h-[44px]"
                          aria-label="Возобновить"
                        >
                          <Play className="w-4 h-4" />
                          Возобновить
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      <CreateCampaignSheet open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
