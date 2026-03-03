import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";
import type { GifItem } from "@/lib/chat/gifService";

export interface SavedGif {
  id: string;
  user_id: string;
  gif_url: string;
  preview_url?: string | null;
  width?: number | null;
  height?: number | null;
  source: string;
  saved_at: string;
}

export function useSavedGifs() {
  const { user } = useAuth();
  const [savedGifs, setSavedGifs] = useState<SavedGif[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("user_saved_gifs")
        .select("*")
        .eq("user_id", user.id)
        .order("saved_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      setSavedGifs((data || []) as SavedGif[]);
    } catch (err) {
      console.error("useSavedGifs: load", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const saveGif = useCallback(
    async (gif: GifItem) => {
      if (!user) return;
      const { error } = await (supabase as any).from("user_saved_gifs").upsert({
        user_id: user.id,
        gif_url: gif.url,
        preview_url: gif.previewUrl,
        width: gif.width,
        height: gif.height,
        source: "tenor",
      });
      if (!error) await load();
    },
    [user, load]
  );

  const removeGif = useCallback(
    async (gifUrl: string) => {
      if (!user) return;
      const { error } = await (supabase as any)
        .from("user_saved_gifs")
        .delete()
        .eq("user_id", user.id)
        .eq("gif_url", gifUrl);
      if (!error)
        setSavedGifs((prev) => prev.filter((g) => g.gif_url !== gifUrl));
    },
    [user]
  );

  const isGifSaved = useCallback(
    (gifUrl: string) => savedGifs.some((g) => g.gif_url === gifUrl),
    [savedGifs]
  );

  return { savedGifs, loading, saveGif, removeGif, isGifSaved, reload: load };
}
