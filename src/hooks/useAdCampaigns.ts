/**
 * useAdCampaigns — управление рекламными кампаниями.
 *
 * Возвращает:
 *  - campaigns — список кампаний
 *  - createCampaign / updateCampaign / submitForReview / pauseCampaign / resumeCampaign
 *  - getCampaignStats — статистика кампании
 *  - loading
 */
import { useState, useEffect, useCallback } from "react";
import { dbLoose } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { logger } from "@/lib/logger";
import { toast } from "sonner";

export interface Targeting {
  age_min?: number;
  age_max?: number;
  gender?: "all" | "male" | "female";
  interests?: string[];
  locations?: string[];
}

export interface AdCampaign {
  id: string;
  name: string;
  status: string;
  objective: string;
  budget_cents: number;
  spent_cents: number;
  daily_budget_cents: number | null;
  start_date: string;
  end_date: string | null;
  targeting: Targeting;
  created_at: string;
  updated_at: string;
}

export interface CampaignStats {
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  cpc: number;
}

type CreateCampaignInput = {
  name: string;
  objective: string;
  budget_cents: number;
  daily_budget_cents?: number;
  start_date: string;
  end_date?: string;
  targeting?: Targeting;
};

export function useAdCampaigns() {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      setCampaigns([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    dbLoose
      .from("ad_campaigns")
      .select("*")
      .eq("advertiser_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          logger.error("[useAdCampaigns] Ошибка загрузки кампаний", { error });
        } else {
          setCampaigns((data ?? []) as AdCampaign[]);
        }
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [user]);

  const createCampaign = useCallback(
    async (input: CreateCampaignInput): Promise<AdCampaign | null> => {
      if (!user) { toast.error("Требуется авторизация"); return null; }

      try {
        const { data, error } = await dbLoose
          .from("ad_campaigns")
          .insert({
            advertiser_id: user.id,
            name: input.name.trim(),
            objective: input.objective,
            budget_cents: input.budget_cents,
            daily_budget_cents: input.daily_budget_cents ?? null,
            start_date: input.start_date,
            end_date: input.end_date ?? null,
            targeting: input.targeting ?? {},
            status: "draft",
          })
          .select("*")
          .single();

        if (error) {
          logger.error("[useAdCampaigns] Ошибка создания", { error });
          toast.error("Не удалось создать кампанию");
          return null;
        }

        const campaign = data as AdCampaign;
        setCampaigns((prev) => [campaign, ...prev]);
        toast.success("Кампания создана");
        return campaign;
      } catch (e) {
        logger.error("[useAdCampaigns] createCampaign error", { error: e });
        toast.error("Ошибка при создании кампании");
        return null;
      }
    },
    [user],
  );

  const updateCampaign = useCallback(
    async (id: string, updates: Partial<CreateCampaignInput>): Promise<void> => {
      if (!user) return;

      try {
        const { data, error } = await dbLoose
          .from("ad_campaigns")
          .update(updates)
          .eq("id", id)
          .eq("advertiser_id", user.id)
          .select("*")
          .single();

        if (error) {
          logger.error("[useAdCampaigns] updateCampaign error", { error });
          toast.error("Не удалось обновить кампанию");
          return;
        }

        setCampaigns((prev) => prev.map((c) => c.id === id ? (data as AdCampaign) : c));
        toast.success("Кампания обновлена");
      } catch (e) {
        logger.error("[useAdCampaigns] updateCampaign unexpected", { error: e });
        toast.error("Ошибка при обновлении кампании");
      }
    },
    [user],
  );

  const submitForReview = useCallback(
    async (id: string): Promise<void> => {
      if (!user) return;
      try {
        const { error } = await dbLoose
          .from("ad_campaigns")
          .update({ status: "review" })
          .eq("id", id)
          .eq("advertiser_id", user.id)
          .eq("status", "draft");

        if (error) {
          logger.error("[useAdCampaigns] submitForReview error", { error });
          toast.error("Не удалось отправить на модерацию");
          return;
        }

        setCampaigns((prev) => prev.map((c) => c.id === id ? { ...c, status: "review" } : c));
        toast.success("Кампания отправлена на модерацию");
      } catch (e) {
        logger.error("[useAdCampaigns] submitForReview unexpected", { error: e });
        toast.error("Ошибка при отправке на модерацию");
      }
    },
    [user],
  );

  const pauseCampaign = useCallback(
    async (id: string): Promise<void> => {
      if (!user) return;
      try {
        const { error } = await dbLoose
          .from("ad_campaigns")
          .update({ status: "paused" })
          .eq("id", id)
          .eq("advertiser_id", user.id)
          .eq("status", "active");

        if (error) {
          logger.error("[useAdCampaigns] pauseCampaign error", { error });
          toast.error("Не удалось приостановить кампанию");
          return;
        }

        setCampaigns((prev) => prev.map((c) => c.id === id ? { ...c, status: "paused" } : c));
        toast.success("Кампания приостановлена");
      } catch (e) {
        logger.error("[useAdCampaigns] pauseCampaign unexpected", { error: e });
      }
    },
    [user],
  );

  const resumeCampaign = useCallback(
    async (id: string): Promise<void> => {
      if (!user) return;
      try {
        const { error } = await dbLoose
          .from("ad_campaigns")
          .update({ status: "active" })
          .eq("id", id)
          .eq("advertiser_id", user.id)
          .eq("status", "paused");

        if (error) {
          logger.error("[useAdCampaigns] resumeCampaign error", { error });
          toast.error("Не удалось возобновить кампанию");
          return;
        }

        setCampaigns((prev) => prev.map((c) => c.id === id ? { ...c, status: "active" } : c));
        toast.success("Кампания возобновлена");
      } catch (e) {
        logger.error("[useAdCampaigns] resumeCampaign unexpected", { error: e });
      }
    },
    [user],
  );

  const getCampaignStats = useCallback(
    async (campaignId: string): Promise<CampaignStats | null> => {
      if (!user) return null;

      try {
        // Получаем ID креативов кампании
        const { data: creatives, error: crErr } = await dbLoose
          .from("ad_creatives")
          .select("id")
          .eq("campaign_id", campaignId)
          .limit(100);

        if (crErr || !creatives?.length) return { impressions: 0, clicks: 0, conversions: 0, ctr: 0, cpc: 0 };

        const creativeIds = (creatives as Array<{ id: string }>).map((c) => c.id);

        // Считаем впечатления, клики, конверсии
        const [impRes, clickRes, convRes] = await Promise.all([
          dbLoose.from("ad_impressions").select("id", { count: "exact", head: true }).in("creative_id", creativeIds).eq("action", "impression"),
          dbLoose.from("ad_impressions").select("id", { count: "exact", head: true }).in("creative_id", creativeIds).eq("action", "click"),
          dbLoose.from("ad_impressions").select("id", { count: "exact", head: true }).in("creative_id", creativeIds).eq("action", "conversion"),
        ]);

        const impressions = (impRes.count as number | null) ?? 0;
        const clicks = (clickRes.count as number | null) ?? 0;
        const conversions = (convRes.count as number | null) ?? 0;

        const campaign = campaigns.find((c) => c.id === campaignId);
        const spent = campaign?.spent_cents ?? 0;
        const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
        const cpc = clicks > 0 ? spent / clicks : 0;

        return { impressions, clicks, conversions, ctr: Math.round(ctr * 100) / 100, cpc: Math.round(cpc) };
      } catch (e) {
        logger.error("[useAdCampaigns] getCampaignStats error", { error: e });
        return null;
      }
    },
    [user, campaigns],
  );

  return {
    campaigns,
    createCampaign,
    updateCampaign,
    submitForReview,
    pauseCampaign,
    resumeCampaign,
    getCampaignStats,
    loading,
  } as const;
}
