/**
 * useCustomEmoji — управление кастомными эмодзи-паками.
 *
 * Возвращает:
 *  - myPacks: установленные паки с эмодзи
 *  - browsePacks(query?) — поиск публичных паков
 *  - installPack(packId) / uninstallPack(packId)
 *  - createPack(name, description)
 *  - addEmoji(packId, shortcode, imageUrl)
 *  - removeEmoji(emojiId)
 *  - loading
 */

import { useState, useEffect, useCallback } from "react";
import { dbLoose } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { logger } from "@/lib/logger";
import { toast } from "sonner";

export interface EmojiPack {
  id: string;
  creator_id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  install_count: number;
  created_at: string;
  emojis: CustomEmojiItem[];
}

export interface CustomEmojiItem {
  id: string;
  pack_id: string;
  shortcode: string;
  image_url: string;
  sort_order: number;
}

const MAX_PACKS = 50;
const MAX_BROWSE = 30;
const MAX_EMOJIS_PER_PACK = 50;

export function useCustomEmoji() {
  const { user } = useAuth();
  const [myPacks, setMyPacks] = useState<EmojiPack[]>([]);
  const [browseResults, setBrowseResults] = useState<EmojiPack[]>([]);
  const [loading, setLoading] = useState(false);
  const [browseLoading, setBrowseLoading] = useState(false);

  // Загрузка установленных паков
  useEffect(() => {
    if (!user) {
      setMyPacks([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        // 1. Получаем ID установленных паков
        const { data: installed, error: instErr } = await dbLoose
          .from("user_emoji_packs")
          .select("pack_id")
          .eq("user_id", user.id)
          .limit(MAX_PACKS);

        if (instErr) throw instErr;
        if (cancelled) return;

        const packIds = (installed ?? []).map((r) => (r as Record<string, unknown>).pack_id as string);
        if (packIds.length === 0) {
          setMyPacks([]);
          setLoading(false);
          return;
        }

        // 2. Загружаем паки
        const { data: packs, error: packsErr } = await dbLoose
          .from("emoji_packs")
          .select("id, creator_id, name, description, is_public, install_count, created_at")
          .in("id", packIds)
          .limit(MAX_PACKS);

        if (packsErr) throw packsErr;
        if (cancelled) return;

        // 3. Загружаем эмодзи для всех паков
        const { data: emojis, error: emojisErr } = await dbLoose
          .from("custom_emojis")
          .select("id, pack_id, shortcode, image_url, sort_order")
          .in("pack_id", packIds)
          .order("sort_order", { ascending: true })
          .limit(500);

        if (emojisErr) throw emojisErr;
        if (cancelled) return;

        const emojisByPack = new Map<string, CustomEmojiItem[]>();
        for (const e of (emojis ?? []) as unknown as CustomEmojiItem[]) {
          const list = emojisByPack.get(e.pack_id) ?? [];
          list.push(e);
          emojisByPack.set(e.pack_id, list);
        }

        const result: EmojiPack[] = ((packs ?? []) as unknown as Omit<EmojiPack, "emojis">[]).map((p) => ({
          ...p,
          emojis: emojisByPack.get(p.id) ?? [],
        }));

        setMyPacks(result);
      } catch (err) {
        logger.error("[useCustomEmoji] Ошибка загрузки паков", { error: err });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [user]);

  const browsePacks = useCallback(async (query?: string) => {
    setBrowseLoading(true);
    try {
      let q = dbLoose
        .from("emoji_packs")
        .select("id, creator_id, name, description, is_public, install_count, created_at")
        .eq("is_public", true)
        .order("install_count", { ascending: false })
        .limit(MAX_BROWSE);

      if (query?.trim()) {
        q = q.ilike("name", `%${query.trim()}%`);
      }

      const { data, error } = await q;
      if (error) throw error;

      const packs = (data ?? []) as unknown as Omit<EmojiPack, "emojis">[];
      const packIds = packs.map((p) => p.id);

      let emojisMap = new Map<string, CustomEmojiItem[]>();
      if (packIds.length > 0) {
        const { data: emojis } = await dbLoose
          .from("custom_emojis")
          .select("id, pack_id, shortcode, image_url, sort_order")
          .in("pack_id", packIds)
          .order("sort_order", { ascending: true })
          .limit(500);

        for (const e of (emojis ?? []) as unknown as CustomEmojiItem[]) {
          const list = emojisMap.get(e.pack_id) ?? [];
          list.push(e);
          emojisMap.set(e.pack_id, list);
        }
      }

      setBrowseResults(packs.map((p) => ({ ...p, emojis: emojisMap.get(p.id) ?? [] })));
    } catch (err) {
      logger.error("[useCustomEmoji] Ошибка поиска паков", { error: err });
      toast.error("Не удалось загрузить паки");
    } finally {
      setBrowseLoading(false);
    }
  }, []);

  const installPack = useCallback(async (packId: string) => {
    if (!user) { toast.error("Требуется авторизация"); return; }
    try {
      const { error } = await dbLoose
        .from("user_emoji_packs")
        .insert({ user_id: user.id, pack_id: packId });
      if (error) throw error;

      // Обновляем счётчик
      try {
        await dbLoose.rpc("increment_emoji_pack_installs" as never, { p_pack_id: packId } as never);
      } catch {
        // rpc может не существовать — игнорируем
      }

      toast.success("Пак установлен");
      // Перезагружаем
      const moved = browseResults.find((p) => p.id === packId);
      if (moved) {
        setMyPacks((prev) => [...prev, { ...moved, install_count: moved.install_count + 1 }]);
      }
    } catch (err) {
      logger.error("[useCustomEmoji] Ошибка установки пака", { error: err });
      toast.error("Не удалось установить пак");
    }
  }, [user, browseResults]);

  const uninstallPack = useCallback(async (packId: string) => {
    if (!user) return;
    try {
      const { error } = await dbLoose
        .from("user_emoji_packs")
        .delete()
        .eq("user_id", user.id)
        .eq("pack_id", packId);
      if (error) throw error;
      setMyPacks((prev) => prev.filter((p) => p.id !== packId));
      toast.success("Пак удалён");
    } catch (err) {
      logger.error("[useCustomEmoji] Ошибка удаления пака", { error: err });
      toast.error("Не удалось удалить пак");
    }
  }, [user]);

  const createPack = useCallback(async (name: string, description?: string): Promise<string | null> => {
    if (!user) { toast.error("Требуется авторизация"); return null; }
    if (name.trim().length < 2) { toast.error("Название должно содержать минимум 2 символа"); return null; }
    try {
      const { data, error } = await dbLoose
        .from("emoji_packs")
        .insert({ creator_id: user.id, name: name.trim(), description: description?.trim() ?? null })
        .select("id")
        .single();
      if (error) throw error;
      const newId = (data as Record<string, unknown>)?.id as string;
      toast.success("Пак создан");
      return newId;
    } catch (err) {
      logger.error("[useCustomEmoji] Ошибка создания пака", { error: err });
      toast.error("Не удалось создать пак");
      return null;
    }
  }, [user]);

  const addEmoji = useCallback(async (packId: string, shortcode: string, imageUrl: string) => {
    if (!user) return;
    const pack = myPacks.find((p) => p.id === packId);
    if (pack && pack.emojis.length >= MAX_EMOJIS_PER_PACK) {
      toast.error(`Максимум ${MAX_EMOJIS_PER_PACK} эмодзи в паке`);
      return;
    }
    try {
      const nextOrder = pack ? pack.emojis.length : 0;
      const { data, error } = await dbLoose
        .from("custom_emojis")
        .insert({ pack_id: packId, shortcode: shortcode.trim(), image_url: imageUrl, sort_order: nextOrder })
        .select("id, pack_id, shortcode, image_url, sort_order")
        .single();
      if (error) throw error;
      const emoji = data as unknown as CustomEmojiItem;
      setMyPacks((prev) =>
        prev.map((p) =>
          p.id === packId ? { ...p, emojis: [...p.emojis, emoji] } : p,
        ),
      );
      toast.success("Эмодзи добавлен");
    } catch (err) {
      logger.error("[useCustomEmoji] Ошибка добавления эмодзи", { error: err });
      toast.error("Не удалось добавить эмодзи");
    }
  }, [user, myPacks]);

  const removeEmoji = useCallback(async (emojiId: string) => {
    if (!user) return;
    try {
      const { error } = await dbLoose
        .from("custom_emojis")
        .delete()
        .eq("id", emojiId);
      if (error) throw error;
      setMyPacks((prev) =>
        prev.map((p) => ({
          ...p,
          emojis: p.emojis.filter((e) => e.id !== emojiId),
        })),
      );
    } catch (err) {
      logger.error("[useCustomEmoji] Ошибка удаления эмодзи", { error: err });
      toast.error("Не удалось удалить эмодзи");
    }
  }, [user]);

  return {
    myPacks,
    browseResults,
    browsePacks,
    installPack,
    uninstallPack,
    createPack,
    addEmoji,
    removeEmoji,
    loading,
    browseLoading,
  } as const;
}
