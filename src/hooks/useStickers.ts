import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";

export interface StickerPack {
  id: string;
  name: string;
  title: string;
  thumbnail_url?: string | null;
  is_official: boolean;
  is_animated: boolean;
  sticker_count: number;
  install_count: number;
}

export interface Sticker {
  id: string;
  pack_id: string;
  emoji?: string | null;
  file_url: string;
  file_type: string;
  width: number;
  height: number;
  position: number;
}

export function useStickers() {
  const { user } = useAuth();
  const [installedPacks, setInstalledPacks] = useState<StickerPack[]>([]);
  const [recentStickers, setRecentStickers] = useState<Sticker[]>([]);
  const [loading, setLoading] = useState(false);

  const loadInstalledPacks = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("user_sticker_packs")
        .select("position, sticker_packs(*)")
        .eq("user_id", user.id)
        .order("position");
      if (error) throw error;
      const packs = (data || [])
        .map((row: any) => row.sticker_packs)
        .filter(Boolean);
      setInstalledPacks(packs);
    } catch (err) {
      console.error("useStickers: loadInstalledPacks", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const loadRecentStickers = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await (supabase as any)
        .from("user_recent_stickers")
        .select("stickers(*)")
        .eq("user_id", user.id)
        .order("used_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      const stickers = (data || [])
        .map((row: any) => row.stickers)
        .filter(Boolean);
      setRecentStickers(stickers);
    } catch (err) {
      console.error("useStickers: loadRecentStickers", err);
    }
  }, [user]);

  useEffect(() => {
    loadInstalledPacks();
    loadRecentStickers();
  }, [loadInstalledPacks, loadRecentStickers]);

  const installPack = useCallback(
    async (packId: string) => {
      if (!user) return;
      const maxPos = installedPacks.length;
      const { error } = await (supabase as any).from("user_sticker_packs").upsert({
        user_id: user.id,
        pack_id: packId,
        position: maxPos,
      });
      if (!error) {
        await loadInstalledPacks();
        // increment install_count
        await (supabase as any).rpc("increment_sticker_pack_install", { pack_id: packId }).maybeSingle();
      }
    },
    [user, installedPacks.length, loadInstalledPacks]
  );

  const removePack = useCallback(
    async (packId: string) => {
      if (!user) return;
      const { error } = await (supabase as any)
        .from("user_sticker_packs")
        .delete()
        .eq("user_id", user.id)
        .eq("pack_id", packId);
      if (!error) await loadInstalledPacks();
    },
    [user, loadInstalledPacks]
  );

  const getPackStickers = useCallback(async (packId: string): Promise<Sticker[]> => {
    const { data, error } = await (supabase as any)
      .from("stickers")
      .select("*")
      .eq("pack_id", packId)
      .order("position");
    if (error) return [];
    return (data || []) as Sticker[];
  }, []);

  const trackUsage = useCallback(
    async (stickerId: string) => {
      if (!user) return;
      await (supabase as any).from("user_recent_stickers").upsert({
        user_id: user.id,
        sticker_id: stickerId,
        used_at: new Date().toISOString(),
        use_count: 1,
      });
      // Also update used_at & use_count via raw SQL would be ideal,
      // but upsert above resets. Do a follow-up update:
      await (supabase as any)
        .from("user_recent_stickers")
        .update({ used_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .eq("sticker_id", stickerId);
      await loadRecentStickers();
    },
    [user, loadRecentStickers]
  );

  const searchByEmoji = useCallback(async (emoji: string): Promise<Sticker[]> => {
    const { data, error } = await (supabase as any)
      .from("stickers")
      .select("*")
      .eq("emoji", emoji)
      .limit(20);
    if (error) return [];
    return (data || []) as Sticker[];
  }, []);

  return {
    installedPacks,
    recentStickers,
    loading,
    installPack,
    removePack,
    getPackStickers,
    trackUsage,
    searchByEmoji,
    reload: loadInstalledPacks,
  };
}
