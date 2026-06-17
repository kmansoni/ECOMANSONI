/**
 * AdCampaignDetailPage — детальная страница кампании с управлением креативами.
 *
 * Функциональность:
 * - Просмотр информации о кампании
 * - Список креативов (пагинация)
 * - Добавление/редактирование креативов (через CreativeEditor)
 * - Отправка на модерацию
 * - Превью креатива
 * - Статистика кампании
 */

import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Plus,
  MoreVertical,
  DollarSign,
  Target,
  Calendar,
  BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useAdCampaigns } from "@/hooks/useAdCampaigns";
import { useAdCreatives } from "@/hooks/useAdCreatives";
import { CreativeCard } from "@/components/ads/CreativeCard";
import { CreativeEditor } from "@/components/ads/CreativeEditor";
import { CreativePreview } from "@/components/ads/CreativePreview";
import { CreativeStatusBadge } from "@/components/ads/CreativeStatusBadge";
import { ModerationQueue } from "@/components/ads/ModerationQueue";
import { toast } from "sonner";
import { validateCreativeInput } from "@/lib/validators";
import type { AdCreative, AdCreativeInsert } from "@/lib/ads/types";

export default function AdCampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { campaigns, getCampaignStats, loading: campaignsLoading } = useAdCampaigns();
  const {
    creatives,
    addCreative,
    updateCreative,
    deleteCreative,
    loading: creativesLoading,
    hasMore,
    loadMore,
  } = useAdCreatives(id || '');

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingCreative, setEditingCreative] = useState<AdCreative | null>(null);
  const [previewCreative, setPreviewCreative] = useState<AdCreative | null>(null);
  const [previewFormat, setPreviewFormat] = useState<'feed' | 'story' | 'reels'>('feed');
  const [serverError, setServerError] = useState<string | null>(null);

  // Находим текущую кампанию
  const campaign = campaigns.find(c => c.id === id);

  // Обработчики
  const handleOpenEditor = (creative?: AdCreative) => {
    setEditingCreative(creative || null);
    setEditorOpen(true);
  };

  const handleCloseEditor = () => {
    setEditorOpen(false);
    setEditingCreative(null);
  };

  const handleSubmitCreative = async (data: AdCreativeInsert) => {
    setServerError(null);

    const errors = validateCreativeInput(data);
    if (errors.length > 0) {
      setServerError(errors[0]);
      return;
    }

    let success = false;
    if (editingCreative) {
      success = await updateCreative(editingCreative.id, data);
    } else {
      const created = await addCreative(data);
      success = created !== null;
    }

    if (success) {
      handleCloseEditor();
    }
  };

  const handleDeleteCreative = async (creativeId: string) => {
    if (confirm('Удалить креатив?')) {
      await deleteCreative(creativeId);
    }
  };

  const handleSubmitReview = async (creative: AdCreative) => {
    // Переводим в pending_review
    await updateCreative(creative.id, { status: 'pending_review' });
    toast.success('Креатив отправлен на модерацию');
  };

  // Если кампания не загружена
  if (!campaignsLoading && !campaign) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Кампания не найдена</h2>
          <Button onClick={() => navigate('/ads')}>Назад к кампаниям</Button>
        </div>
      </div>
    );
  }

  const stats = getCampaignStats(campaign?.id || '');

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-lg border-b px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/ads')}
            aria-label="Назад"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1 min-w-0">
            {campaignsLoading ? (
              <Skeleton className="h-6 w-48" />
            ) : (
              <>
                <h1 className="font-semibold truncate">{campaign?.name}</h1>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant={
                    campaign?.status === 'active' ? 'default' :
                    campaign?.status === 'paused' ? 'secondary' :
                    campaign?.status === 'draft' ? 'outline' : 'destructive'
                  }>
                    {campaign?.status}
                  </Badge>
                  <span>{campaign?.objective}</span>
                </div>
              </>
            )}
          </div>
          <Button onClick={() => handleOpenEditor()}>
            <Plus className="w-4 h-4 mr-2" />
            Креатив
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 space-y-6">
        {/* Campaign Info Card */}
        {campaign && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Информация о кампании</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Бюджет</p>
                  <p className="font-medium">{(campaign.budget_cents / 100).toFixed(0)} ₽</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Цель</p>
                  <p className="font-medium">{campaign.objective}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Период</p>
                  <p className="font-medium">
                    {campaign.start_date} — {campaign.end_date || '∞'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Показы</p>
                  <p className="font-medium">{stats?.impressions.toLocaleString('ru-RU') || '-'}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats Overview */}
        {stats && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Статистика кампании</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="p-3 rounded-lg bg-muted/50 text-center">
                  <p className="text-xs text-muted-foreground">Показы</p>
                  <p className="text-lg font-semibold">{stats.impressions.toLocaleString('ru-RU')}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50 text-center">
                  <p className="text-xs text-muted-foreground">Клики</p>
                  <p className="text-lg font-semibold">{stats.clicks.toLocaleString('ru-RU')}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50 text-center">
                  <p className="text-xs text-muted-foreground">Конверсии</p>
                  <p className="text-lg font-semibold">{stats.conversions.toLocaleString('ru-RU')}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50 text-center">
                  <p className="text-xs text-muted-foreground">CTR</p>
                  <p className="text-lg font-semibold">{stats.ctr}%</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50 text-center">
                  <p className="text-xs text-muted-foreground">CPC</p>
                  <p className="text-lg font-semibold">{(stats.cpc / 100).toFixed(2)} ₽</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Moderation Queue (только для pending_review) */}
        <ModerationQueue campaignId={id} />

        {/* Creative List */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Креативы ({creatives.length})</h2>
            <Button onClick={() => handleOpenEditor()}>
              <Plus className="w-4 h-4 mr-2" />
              Добавить
            </Button>
          </div>

          {creativesLoading && creatives.length === 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-48 rounded-xl" />
              ))}
            </div>
          ) : creatives.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <p>Нет креативов. Создайте первый!</p>
                <Button className="mt-4" onClick={() => handleOpenEditor()}>
                  <Plus className="w-4 h-4 mr-2" />
                  Создать креатив
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {creatives.map((creative) => (
                  <CreativeCard
                    key={creative.id}
                    creative={creative}
                    onEdit={() => handleOpenEditor(creative)}
                    onDelete={handleDeleteCreative}
                    onPreview={setPreviewCreative}
                    onSubmitReview={handleSubmitReview}
                  />
                ))}
              </div>

              {/* Load More */}
              {hasMore && (
                <div className="mt-6 text-center">
                  <Button variant="outline" onClick={loadMore} disabled={creativesLoading}>
                    {creativesLoading ? 'Загрузка...' : 'Загрузить ещё'}
                  </Button>
                </div>
              )}
            </>
          )}
        </section>
      </main>

      {/* Creative Editor Modal */}
      <CreativeEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        onSubmit={handleSubmitCreative}
        initialData={editingCreative}
        submitLabel={editingCreative ? 'Сохранить изменения' : 'Создать креатив'}
      />

      {/* Creative Preview Modal */}
      {previewCreative && (
        <Dialog open={!!previewCreative} onOpenChange={(open) => !open && setPreviewCreative(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Просмотр креатива</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex gap-2 justify-center">
                <Button
                  variant={previewFormat === 'feed' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setPreviewFormat('feed')}
                >
                  Лента
                </Button>
                <Button
                  variant={previewFormat === 'story' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setPreviewFormat('story')}
                >
                  История
                </Button>
                <Button
                  variant={previewFormat === 'reels' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setPreviewFormat('reels')}
                >
                  Reels
                </Button>
              </div>

              <CreativePreview creative={previewCreative} format={previewFormat} />

              <div className="text-sm border-t pt-3 space-y-1">
                <p><strong>Заголовок:</strong> {previewCreative.headline}</p>
                {previewCreative.description && (
                  <p><strong>Описание:</strong> {previewCreative.description}</p>
                )}
                <p><strong>CTA:</strong> {previewCreative.call_to_action}</p>
                <p><strong>Ссылка:</strong> {previewCreative.destination_url}</p>
                <p><strong>Статус:</strong> <CreativeStatusBadge status={previewCreative.status} showIcon /></p>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
