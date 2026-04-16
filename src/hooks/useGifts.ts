import { useState, useEffect, useCallback, useRef } from "react";
import { dbLoose } from "@/lib/supabase";
import { useAuth } from "./useAuth";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

export interface GiftCatalogItem {
  id: string;
  name: string;
  emoji: string;
  description?: string | null;
  price_stars: number;
  animation_url?: string | null;
  category: string;
  rarity: "common" | "rare" | "epic" | "legendary";
  is_available: boolean;
  sort_order: number;
}

export interface SentGift {
  id: string;
  gift_id: string;
  sender_id: string;
  recipient_id: string;
  conversation_id: string;
  message_id?: string | null;
  message_text?: string | null;
  stars_spent: number;
  is_opened: boolean;
  opened_at?: string | null;
  created_at: string;
  gift?: GiftCatalogItem;
}

let catalogCache: GiftCatalogItem[] | null = null;

async function withRetry<T>(fn: () => Promise<T>, retries = 2, delayMs = 1000): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, delayMs * Math.pow(2, attempt)));
    }
  }
  throw new Error("withRetry exhausted");
}

export function useGifts() {
  const { user } = useAuth();
  const [catalog, setCatalog] = useState<GiftCatalogItem[]>(catalogCache ?? []);
  const [receivedGifts, setReceivedGifts] = useState<SentGift[]>([]);
  const [sentGifts, setSentGifts] = useState<SentGift[]>([]);
  const [loading, setLoading] = useState(false);
  const fetchingCatalog = useRef(false);

  const fetchCatalog = useCallback(async () => {
    if (catalogCache) {
      setCatalog(catalogCache);
      return;
    }
    if (fetchingCatalog.current) return;
    fetchingCatalog.current = true;
    try {
      const data = await withRetry(async () => {
        const { data, error } = await dbLoose
          .from("gift_catalog")
          .select("*")
          .eq("is_available", true)
          .order("sort_order", { ascending: true });
        if (error) throw error;
        return data;
      });
      catalogCache = (data ?? []) as GiftCatalogItem[];
      setCatalog(catalogCache!);
    } catch (e) {
      logger.error("[useGifts] fetchCatalog error after retries", { error: e });
    } finally {
      fetchingCatalog.current = false;
    }
  }, []);

  const fetchReceivedGifts = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await dbLoose
        .from("sent_gifts")
        .select("*, gift:gift_catalog(*)")
        .eq("recipient_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      setReceivedGifts((data ?? []) as SentGift[]);
    } catch (e) {
      logger.error("[useGifts] fetchReceivedGifts error", { error: e });
    }
  }, [user]);

  const fetchSentGifts = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await dbLoose
        .from("sent_gifts")
        .select("*, gift:gift_catalog(*)")
        .eq("sender_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      setSentGifts((data ?? []) as SentGift[]);
    } catch (e) {
      logger.error("[useGifts] fetchSentGifts error", { error: e });
    }
  }, [user]);

  useEffect(() => {
    fetchCatalog();
  }, [fetchCatalog]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    Promise.all([fetchReceivedGifts(), fetchSentGifts()]).finally(() =>
      setLoading(false)
    );
  }, [user, fetchReceivedGifts, fetchSentGifts]);

  const sendGift = useCallback(
    async (params: {
      recipientId: string;
      giftId: string;
      conversationId: string;
      messageText?: string;
    }): Promise<{ ok: boolean; error?: string; sentGiftId?: string; giftEmoji?: string; giftName?: string }> => {
      if (!user) return { ok: false, error: "not_authenticated" };
      try {
        const { data: rpcRaw, error } = await dbLoose.rpc("send_gift_v1", {
          p_sender_id: user.id,
          p_recipient_id: params.recipientId,
          p_gift_id: params.giftId,
          p_conversation_id: params.conversationId,
          p_message_text: params.messageText ?? null,
        });
        if (error) {
          logger.error("[useGifts] send_gift_v1 error", { error });
          return { ok: false, error: error.message };
        }
        const data = rpcRaw as { ok?: boolean; error?: string; sent_gift_id?: string; gift_emoji?: string; gift_name?: string } | null;
        if (!data?.ok) {
          return { ok: false, error: data?.error ?? "unknown" };
        }
        return {
          ok: true,
          sentGiftId: data.sent_gift_id,
          giftEmoji: data.gift_emoji,
          giftName: data.gift_name,
        };
      } catch (e: any) {
        return { ok: false, error: e?.message ?? "unknown" };
      }
    },
    [user]
  );

  const openGift = useCallback(
    async (sentGiftId: string) => {
      if (!user) return;
      try {
        await dbLoose
          .from("sent_gifts")
          .update({ is_opened: true, opened_at: new Date().toISOString() })
          .eq("id", sentGiftId)
          .eq("recipient_id", user.id);
        setReceivedGifts((prev) =>
          prev.map((g) =>
            g.id === sentGiftId
              ? { ...g, is_opened: true, opened_at: new Date().toISOString() }
              : g
          )
        );
      } catch (e) {
        logger.error("[useGifts] openGift error", { error: e });
        toast.error("Не удалось открыть подарок");
      }
    },
    [user]
  );

  return {
    catalog,
    loading,
    sendGift,
    receivedGifts,
    sentGifts,
    openGift,
    refreshCatalog: () => {
      catalogCache = null;
      fetchCatalog();
    },
    refetch: () => {
      fetchReceivedGifts();
      fetchSentGifts();
    },
  };
}
