/**
 * useAdCreatives — управление креативами рекламной кампании.
 *
 * @param campaignId — ID кампании
 *
 * Возвращает:
 *  - creatives — список креативов
 *  - addCreative / updateCreative / deleteCreative
 *  - loading
 */
import { useState, useEffect, useCallback } from "react";
import { dbLoose } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { logger } from "@/lib/logger";
import { toast } from "sonner";

export interface AdCreative {
  id: string;
  campaign_id: string;
  type: "image" | "video" | "carousel" | "story";
  media_url: string;
  headline: string;
  description: string | null;
  call_to_action: string;
  destination_url: string;
  created_at: string;
}

type CreateCreativeInput = {
  type: AdCreative["type"];
  media_url: string;
  headline: string;
  description?: string;
  call_to_action: string;
  destination_url: string;
};

export function useAdCreatives(campaignId: string) {
  const { user } = useAuth();
  const [creatives, setCreatives] = useState<AdCreative[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user || !campaignId) {
      setCreatives([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    dbLoose
      .from("ad_creatives")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          logger.error("[useAdCreatives] Ошибка загрузки креативов", { error });
        } else {
          setCreatives((data ?? []) as AdCreative[]);
        }
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [user, campaignId]);

  const addCreative = useCallback(
    async (input: CreateCreativeInput): Promise<AdCreative | null> => {
      if (!user || !campaignId) { toast.error("Требуется авторизация"); return null; }

      try {
        const { data, error } = await dbLoose
          .from("ad_creatives")
          .insert({
            campaign_id: campaignId,
            type: input.type,
            media_url: input.media_url,
            headline: input.headline.trim(),
            description: input.description?.trim() ?? null,
            call_to_action: input.call_to_action,
            destination_url: input.destination_url.trim(),
          })
          .select("*")
          .single();

        if (error) {
          logger.error("[useAdCreatives] Ошибка добавления креатива", { error });
          toast.error("Не удалось добавить креатив");
          return null;
        }

        const creative = data as AdCreative;
        setCreatives((prev) => [creative, ...prev]);
        toast.success("Креатив добавлен");
        return creative;
      } catch (e) {
        logger.error("[useAdCreatives] addCreative error", { error: e });
        toast.error("Ошибка при добавлении креатива");
        return null;
      }
    },
    [user, campaignId],
  );

  const updateCreative = useCallback(
    async (id: string, updates: Partial<CreateCreativeInput>): Promise<void> => {
      if (!user) return;

      try {
        const { data, error } = await dbLoose
          .from("ad_creatives")
          .update(updates)
          .eq("id", id)
          .select("*")
          .single();

        if (error) {
          logger.error("[useAdCreatives] updateCreative error", { error });
          toast.error("Не удалось обновить креатив");
          return;
        }

        setCreatives((prev) => prev.map((c) => c.id === id ? (data as AdCreative) : c));
        toast.success("Креатив обновлён");
      } catch (e) {
        logger.error("[useAdCreatives] updateCreative unexpected", { error: e });
        toast.error("Ошибка при обновлении креатива");
      }
    },
    [user],
  );

  const deleteCreative = useCallback(
    async (id: string): Promise<void> => {
      if (!user) return;

      try {
        const { error } = await dbLoose
          .from("ad_creatives")
          .delete()
          .eq("id", id);

        if (error) {
          logger.error("[useAdCreatives] deleteCreative error", { error });
          toast.error("Не удалось удалить креатив");
          return;
        }

        setCreatives((prev) => prev.filter((c) => c.id !== id));
        toast.success("Креатив удалён");
      } catch (e) {
        logger.error("[useAdCreatives] deleteCreative unexpected", { error: e });
        toast.error("Ошибка при удалении креатива");
      }
    },
    [user],
  );

  return { creatives, addCreative, updateCreative, deleteCreative, loading } as const;
}
