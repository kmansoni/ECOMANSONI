import { supabase } from "@/lib/supabase";

export type StickerPack = {
  id: string;
  slug: string | null;
  title: string;
  source_type: "builtin" | "user" | "premium" | "business";
  visibility_status: "active" | "hidden" | "blocked";
  is_active: boolean;
  is_premium: boolean;
  is_business: boolean;
  is_animated: boolean;
  owner_user_id: string | null;
  cover_asset_path: string | null;
  item_count: number;
  sort_order: number;
};

export type EmojiSet = {
  id: string;
  slug: string | null;
  title: string;
  source_type: "builtin" | "user" | "premium" | "business";
  is_active: boolean;
  is_premium: boolean;
  sort_order: number;
};

export type UserEmojiPreferences = {
  user_id: string;
  emoji_suggestions_mode: "all" | "frequent" | "never";
  large_emoji_mode: "one" | "up_to_three" | "off";
  recents_first: boolean;
  updated_at: string;
  created_at: string;
};

export type UserQuickReaction = {
  user_id: string;
  emoji: string;
  updated_at: string;
  created_at: string;
};

const DEFAULT_EMOJI_PREFERENCES: Omit<UserEmojiPreferences, "user_id" | "updated_at" | "created_at"> = {
  emoji_suggestions_mode: "all",
  large_emoji_mode: "up_to_three",
  recents_first: true,
};

const DEFAULT_QUICK_REACTION = "❤️";
const supabaseAny = supabase as any;

function withEmojiDefaults(row: Partial<UserEmojiPreferences>): UserEmojiPreferences {
  return {
    ...(DEFAULT_EMOJI_PREFERENCES as any),
    ...(row as any),
  } as UserEmojiPreferences;
}

export async function listStickerPacks(query = ""): Promise<StickerPack[]> {
  let req = supabaseAny
    .from("sticker_packs")
    .select("id, slug, title, source_type, visibility_status, is_active, is_premium, is_business, is_animated, owner_user_id, cover_asset_path, item_count, sort_order")
    .eq("is_active", true)
    .eq("visibility_status", "active")
    .order("sort_order");

  if (query.trim()) {
    req = req.ilike("title", `%${query.trim()}%`);
  }

  const { data, error } = await req;
  if (error) throw error;
  return (data ?? []) as StickerPack[];
}

export async function listMyStickerLibrary(userId: string): Promise<StickerPack[]> {
  const { data, error } = await supabaseAny
    .from("user_sticker_library")
    .select("sort_order, sticker_packs!inner(id, slug, title, source_type, visibility_status, is_active, is_premium, is_business, is_animated, owner_user_id, cover_asset_path, item_count, sort_order)")
    .eq("user_id", userId)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []).map((row: any) => row.sticker_packs as StickerPack);
}

export async function listArchivedStickerPacks(userId: string): Promise<StickerPack[]> {
  const { data, error } = await supabaseAny
    .from("user_sticker_archive")
    .select("archived_at, sticker_packs!inner(id, slug, title, source_type, visibility_status, is_active, is_premium, is_business, is_animated, owner_user_id, cover_asset_path, item_count, sort_order)")
    .eq("user_id", userId)
    .order("archived_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: any) => row.sticker_packs as StickerPack);
}

export async function installStickerPack(userId: string, packId: string): Promise<void> {
  const { error: upsertError } = await supabaseAny
    .from("user_sticker_library")
    .upsert({ user_id: userId, pack_id: packId }, { onConflict: "user_id,pack_id" });
  if (upsertError) throw upsertError;

  const { error: removeArchiveError } = await supabaseAny
    .from("user_sticker_archive")
    .delete()
    .eq("user_id", userId)
    .eq("pack_id", packId);
  if (removeArchiveError) throw removeArchiveError;
}

export async function archiveStickerPack(userId: string, packId: string): Promise<void> {
  const { error: archiveError } = await supabaseAny
    .from("user_sticker_archive")
    .upsert({ user_id: userId, pack_id: packId }, { onConflict: "user_id,pack_id" });
  if (archiveError) throw archiveError;

  const { error: deleteError } = await supabaseAny
    .from("user_sticker_library")
    .delete()
    .eq("user_id", userId)
    .eq("pack_id", packId);
  if (deleteError) throw deleteError;
}

export async function bulkArchiveStickerPacks(userId: string, packIds: string[]): Promise<void> {
  if (!packIds.length) return;
  const archiveRows = packIds.map((packId) => ({ user_id: userId, pack_id: packId }));
  const { error: archiveError } = await supabaseAny
    .from("user_sticker_archive")
    .upsert(archiveRows, { onConflict: "user_id,pack_id" });
  if (archiveError) throw archiveError;

  const { error: deleteError } = await supabaseAny
    .from("user_sticker_library")
    .delete()
    .eq("user_id", userId)
    .in("pack_id", packIds);
  if (deleteError) throw deleteError;
}

export async function bulkRestoreStickerPacks(userId: string, packIds: string[]): Promise<void> {
  if (!packIds.length) return;
  const rows = packIds.map((packId) => ({ user_id: userId, pack_id: packId }));
  const { error: upsertError } = await supabaseAny
    .from("user_sticker_library")
    .upsert(rows, { onConflict: "user_id,pack_id" });
  if (upsertError) throw upsertError;

  const { error: archiveDeleteError } = await supabaseAny
    .from("user_sticker_archive")
    .delete()
    .eq("user_id", userId)
    .in("pack_id", packIds);
  if (archiveDeleteError) throw archiveDeleteError;
}

export async function listEmojiSets(): Promise<EmojiSet[]> {
  const { data, error } = await supabaseAny
    .from("emoji_sets")
    .select("id, slug, title, source_type, is_active, is_premium, sort_order")
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as EmojiSet[];
}

export async function getOrCreateUserEmojiPreferences(userId: string): Promise<UserEmojiPreferences> {
  const { data: existing, error } = await supabaseAny
    .from("user_emoji_preferences")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (existing) return withEmojiDefaults(existing as any);

  const { data, error: insertError } = await supabaseAny
    .from("user_emoji_preferences")
    .insert({ user_id: userId })
    .select("*")
    .single();
  if (insertError) throw insertError;
  return withEmojiDefaults(data as any);
}

export async function updateUserEmojiPreferences(
  userId: string,
  patch: Partial<Omit<UserEmojiPreferences, "user_id" | "updated_at" | "created_at">>,
): Promise<UserEmojiPreferences> {
  const { data, error } = await supabaseAny
    .from("user_emoji_preferences")
    .update(patch)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) throw error;
  return withEmojiDefaults(data as any);
}

export async function listQuickReactionCatalog(): Promise<string[]> {
  const { data, error } = await supabaseAny
    .from("quick_reaction_catalog")
    .select("emoji")
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []).map((row: any) => String(row.emoji));
}

export async function getOrCreateUserQuickReaction(userId: string): Promise<UserQuickReaction> {
  const { data: existing, error } = await supabaseAny
    .from("user_quick_reaction")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (existing) return existing as UserQuickReaction;

  const { data, error: insertError } = await supabaseAny
    .from("user_quick_reaction")
    .insert({ user_id: userId, emoji: DEFAULT_QUICK_REACTION })
    .select("*")
    .single();
  if (insertError) throw insertError;
  return data as UserQuickReaction;
}

export async function setUserQuickReaction(userId: string, emoji: string): Promise<UserQuickReaction> {
  const { data, error } = await supabaseAny
    .from("user_quick_reaction")
    .upsert({ user_id: userId, emoji }, { onConflict: "user_id" })
    .select("*")
    .single();
  if (error) throw error;
  return data as UserQuickReaction;
}

export async function getQuickReactionForChat(userId: string, chatId: string): Promise<string | null> {
  const { data, error } = await supabaseAny
    .from("user_quick_reaction_overrides")
    .select("emoji")
    .eq("user_id", userId)
    .eq("chat_id", chatId)
    .maybeSingle();
  if (error) throw error;
  return (data?.emoji as string | undefined) ?? null;
}

export async function setQuickReactionForChat(userId: string, chatId: string, emoji: string): Promise<void> {
  const { error } = await supabaseAny
    .from("user_quick_reaction_overrides")
    .upsert({ user_id: userId, chat_id: chatId, emoji }, { onConflict: "user_id,chat_id" });
  if (error) throw error;
}

export async function removeQuickReactionForChat(userId: string, chatId: string): Promise<void> {
  const { error } = await supabaseAny
    .from("user_quick_reaction_overrides")
    .delete()
    .eq("user_id", userId)
    .eq("chat_id", chatId);
  if (error) throw error;
}

