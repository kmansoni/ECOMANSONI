/**
 * useAdCampaigns — управление рекламными кампаниями.
 *
 * Фичи:
 * - Загрузка кампаний + предзагрузка статистики (батч, без N+1)
 * - createCampaign / updateCampaign / submitForReview / pauseCampaign / resumeCampaign
 * - getCampaignStats — возвращает кэшированную статистику
 * - Пагинация: limit 100 (временно)
 */

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { logger } from "@/lib/logger";
import { toast } from "sonner";
import type {
  AdCampaign,
  CreateCampaignInput,
  CampaignStats,
  AdCreativeStatus,
  Targeting,
} from "@/lib/ads/types";

export type { Targeting, CampaignStats };

export function useAdCampaigns() {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
  const [loading, setLoading] = useState(false);
  const [statsMap, setStatsMap] = useState<Record<string, CampaignStats>>({});

  // Загрузка кампаний + batch-статистика
  useEffect(() => {
    if (!user) {
      setCampaigns([]);
      setStatsMap({});
      return;
    }

    let cancelled = false;
    const userId = user.id;
    setLoading(true);

    async function load() {
      try {
        // 1. Загружаем кампании
        const { data: campaignsData, error: campErr } = await supabase
          .from('ad_campaigns')
          .select('*')
          .eq('advertiser_id', userId)
          .order('created_at', { ascending: false })
          .limit(100);

        if (campErr) throw campErr;

        const campaignsList = (campaignsData ?? []) as AdCampaign[];
        setCampaigns(campaignsList);

        // 2. Batch-загрузка статистики для всех кампаний
        if (campaignsList.length > 0) {
          const campaignIds = campaignsList.map(c => c.id);

          // Получаем все creative_ids по этим кампаниям
          const { data: creativesData } = await supabase
            .from('ad_creatives')
            .select('id, campaign_id')
            .in('campaign_id', campaignIds)
            .is('deleted_at', null);

          const creativeIds = (creativesData || []).map(c => c.id);

          let statsObj: Record<string, CampaignStats> = {};

          if (creativeIds.length > 0) {
            // Получаем все impressions за раз
            const { data: impressionsData } = await supabase
              .from('ad_impressions')
              .select('creative_id, action')
              .in('creative_id', creativeIds);

            // Группируем по creative_id
            const creativeStats: Record<string, { impressions: number; clicks: number; conversions: number }> = {};
            creativeIds.forEach(id => {
              creativeStats[id] = { impressions: 0, clicks: 0, conversions: 0 };
            });

            (impressionsData || []).forEach((row: any) => {
              if (row.action === 'impression') creativeStats[row.creative_id].impressions++;
              else if (row.action === 'click') creativeStats[row.creative_id].clicks++;
              else if (row.action === 'conversion') creativeStats[row.creative_id].conversions++;
            });

            // Агрегируем по кампаниям
            campaignsList.forEach(c => {
              const campCreativeIds = (creativesData || []).filter((cr: any) => cr.campaign_id === c.id).map((cr: any) => cr.id);
              const total = campCreativeIds.reduce(
                (acc, cid) => {
                  const cs = creativeStats[cid] || { impressions: 0, clicks: 0, conversions: 0 };
                  return {
                    impressions: acc.impressions + cs.impressions,
                    clicks: acc.clicks + cs.clicks,
                    conversions: acc.conversions + cs.conversions,
                  };
                },
                { impressions: 0, clicks: 0, conversions: 0 }
              );

              const spent = c.spent_cents;
              const ctr = total.impressions > 0 ? (total.clicks / total.impressions) * 100 : 0;
              const cpc = total.clicks > 0 ? spent / total.clicks : 0;

              statsObj[c.id] = {
                impressions: total.impressions,
                clicks: total.clicks,
                conversions: total.conversions,
                ctr: Math.round(ctr * 100) / 100,
                cpc: Math.round(cpc),
              };
            });
          } else {
            // Нет креативов — нулевая статистика
            campaignsList.forEach(c => {
              statsObj[c.id] = { impressions: 0, clicks: 0, conversions: 0, ctr: 0, cpc: 0 };
            });
          }

          setStatsMap(statsObj);
        }

      } catch (error) {
        logger.error('[useAdCampaigns] load error', { error });
        toast.error('Не удалось загрузить кампании');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => { cancelled = true; };
  }, [user]);

  // Создание кампании
  const createCampaign = useCallback(
    async (input: CreateCampaignInput): Promise<AdCampaign | null> => {
      if (!user) { toast.error('Требуется авторизация'); return null; }

      try {
        const { data, error } = await supabase
          .from('ad_campaigns')
          .insert({
            advertiser_id: user.id,
            name: input.name.trim(),
            objective: input.objective,
            budget_cents: input.budget_cents,
            daily_budget_cents: input.daily_budget_cents ?? null,
            start_date: input.start_date,
            end_date: input.end_date ?? null,
            targeting: input.targeting ?? {},
            status: 'draft',
          })
          .select('*')
          .single();

        if (error) {
          logger.error('[useAdCampaigns] create error', { error });
          toast.error('Не удалось создать кампанию');
          return null;
        }

        const campaign = data as AdCampaign;
        setCampaigns(prev => [campaign, ...prev]);

        // Добавляем нулевые статистики в map
        setStatsMap(prev => ({
          ...prev,
          [campaign.id]: { impressions: 0, clicks: 0, conversions: 0, ctr: 0, cpc: 0 }
        }));

        toast.success('Кампания создана');
        return campaign;
      } catch (e: any) {
        logger.error('[useAdCampaigns] createCampaign exception', { error: e });
        toast.error('Ошибка при создании кампании');
        return null;
      }
    },
    [user],
  );

  // Обновление кампании
  const updateCampaign = useCallback(
    async (id: string, updates: Partial<CreateCampaignInput>): Promise<void> => {
      if (!user) return;

      try {
        const { data, error } = await supabase
          .from('ad_campaigns')
          .update(updates as any)
          .eq('id', id)
          .eq('advertiser_id', user.id)
          .select('*')
          .single();

        if (error) {
          logger.error('[useAdCampaigns] update error', { error });
          toast.error('Не удалось обновить кампанию');
          return;
        }

        setCampaigns(prev => prev.map(c => c.id === id ? (data as AdCampaign) : c));
        toast.success('Кампания обновлена');
      } catch (e: any) {
        logger.error('[useAdCampaigns] updateCampaign exception', { error: e });
        toast.error('Ошибка при обновлении кампании');
      }
    },
    [user],
  );

  // Пауза кампании
  const pauseCampaign = useCallback(
    async (id: string): Promise<void> => {
      if (!user) return;
      try {
        const { error } = await supabase
          .from('ad_campaigns')
          .update({ status: 'paused' })
          .eq('id', id)
          .eq('advertiser_id', user.id)
          .eq('status', 'active');

        if (error) throw error;
        setCampaigns(prev => prev.map(c => c.id === id ? { ...c, status: 'paused' } : c));
      } catch (e: any) {
        logger.error('[useAdCampaigns] pause error', { error: e });
        toast.error('Не удалось приостановить');
      }
    },
    [user],
  );

  // Возобновление кампании
  const resumeCampaign = useCallback(
    async (id: string): Promise<void> => {
      if (!user) return;
      try {
        const { error } = await supabase
          .from('ad_campaigns')
          .update({ status: 'active' })
          .eq('id', id)
          .eq('advertiser_id', user.id)
          .eq('status', 'paused');

        if (error) throw error;
        setCampaigns(prev => prev.map(c => c.id === id ? { ...c, status: 'active' } : c));
      } catch (e: any) {
        logger.error('[useAdCampaigns] resume error', { error: e });
        toast.error('Не удалось возобновить');
      }
    },
    [user],
  );

  // Отправка на модерацию
  const submitForReview = useCallback(
    async (id: string): Promise<void> => {
      if (!user) return;
      try {
        const { error } = await supabase
          .from('ad_campaigns')
          .update({ status: 'review' })
          .eq('id', id)
          .eq('advertiser_id', user.id)
          .eq('status', 'draft');

        if (error) throw error;
        setCampaigns(prev => prev.map(c => c.id === id ? { ...c, status: 'review' } : c));
        toast.success('Отправлено на модерацию');
      } catch (e: any) {
        logger.error('[useAdCampaigns] submitForReview error', { error: e });
        toast.error('Не удалось отправить на модерацию');
      }
    },
    [user],
  );

  // Получение статистики кампании (из state)
  const getCampaignStats = useCallback((campaignId: string): CampaignStats | null => {
    return statsMap[campaignId] ?? null;
  }, [statsMap]);

  // Обновление статистики для конкретной кампании (вызывается извне после изменений креативов)
  const refreshCampaignStats = useCallback(async (campaignId: string) => {
    if (!user) return;

    try {
      // Получаем creative_ids кампании
      const { data: creativesData } = await supabase
        .from('ad_creatives')
        .select('id')
        .eq('campaign_id', campaignId)
        .is('deleted_at', null);

      const creativeIds = (creativesData || []).map(c => c.id);
      if (creativeIds.length === 0) {
        setStatsMap(prev => ({
          ...prev,
          [campaignId]: { impressions: 0, clicks: 0, conversions: 0, ctr: 0, cpc: 0 }
        }));
        return;
      }

      // Получаем impressions
      const { data: impressionsData } = await supabase
        .from('ad_impressions')
        .select('creative_id, action')
        .in('creative_id', creativeIds);

      // Агрегируем
      const stats = creativeIds.reduce((acc, cid) => {
        acc[cid] = { impressions: 0, clicks: 0, conversions: 0 };
        return acc;
      }, {} as Record<string, { impressions: number; clicks: number; conversions: number }>);

      (impressionsData || []).forEach((row: any) => {
        if (row.action === 'impression') stats[row.creative_id].impressions++;
        else if (row.action === 'click') stats[row.creative_id].clicks++;
        else if (row.action === 'conversion') stats[row.creative_id].conversions++;
      });

      const statValues = Object.values(stats) as Array<{ impressions: number; clicks: number; conversions: number }>;
      const total = statValues.reduce(
        (a, b) => ({
          impressions: a.impressions + b.impressions,
          clicks: a.clicks + b.clicks,
          conversions: a.conversions + b.conversions,
        }),
        { impressions: 0, clicks: 0, conversions: 0 }
      );

      // Получаем spent из campaigns state
      const campaign = campaigns.find(c => c.id === campaignId);
      const spent = campaign?.spent_cents ?? 0;
      const ctr = total.impressions > 0 ? (total.clicks / total.impressions) * 100 : 0;
      const cpc = total.clicks > 0 ? spent / total.clicks : 0;

      setStatsMap(prev => ({
        ...prev,
        [campaignId]: {
          impressions: total.impressions,
          clicks: total.clicks,
          conversions: total.conversions,
          ctr: Math.round(ctr * 100) / 100,
          cpc: Math.round(cpc),
        }
      }));
    } catch (err) {
      logger.error('[useAdCampaigns] refreshStats error', { error: err, campaignId });
    }
  }, [user, campaigns]);

  return {
    campaigns,
    createCampaign,
    updateCampaign,
    submitForReview,
    pauseCampaign,
    resumeCampaign,
    getCampaignStats,
    refreshCampaignStats,
    loading,
  } as const;
}
