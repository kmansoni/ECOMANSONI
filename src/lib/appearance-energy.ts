import { supabase } from "@/lib/supabase";

export type DarkThemeMode = "system" | "light" | "dark";
export type EnergySaverMode = "off" | "auto" | "manual";

export type UserAppearanceSettings = {
  user_id: string;
  chat_theme_id: string;
  chat_wallpaper_id: string;
  personal_color_primary: string;
  personal_color_secondary: string;
  dark_mode_enabled: boolean;
  dark_theme: DarkThemeMode;
  font_scale: number;
  message_corner_radius: number;
  ui_animations_enabled: boolean;
  stickers_emoji_animations_enabled: boolean;
  media_tap_navigation_enabled: boolean;
  updated_at: string;
  created_at: string;
};

export type AppIconCatalogItem = {
  id: string;
  name: string;
  icon_url: string | null;
  is_premium: boolean;
  is_active: boolean;
  sort_order: number;
};

export type UserEnergySaverSettings = {
  user_id: string;
  mode: EnergySaverMode;
  battery_threshold_percent: number;
  autoplay_video: boolean;
  autoplay_gif: boolean;
  animated_stickers: boolean;
  animated_emoji: boolean;
  interface_animations: boolean;
  media_preload: boolean;
  background_updates: boolean;
  updated_at: string;
  created_at: string;
};

const supabaseAny = supabase as any;

const APPEARANCE_DEFAULTS: Omit<UserAppearanceSettings, "user_id" | "updated_at" | "created_at"> = {
  chat_theme_id: "night",
  chat_wallpaper_id: "home",
  personal_color_primary: "#4f8cff",
  personal_color_secondary: "#8b5cf6",
  dark_mode_enabled: true,
  dark_theme: "system",
  font_scale: 100,
  message_corner_radius: 18,
  ui_animations_enabled: true,
  stickers_emoji_animations_enabled: true,
  media_tap_navigation_enabled: true,
};

const ENERGY_DEFAULTS: Omit<UserEnergySaverSettings, "user_id" | "updated_at" | "created_at"> = {
  mode: "off",
  battery_threshold_percent: 15,
  autoplay_video: true,
  autoplay_gif: true,
  animated_stickers: true,
  animated_emoji: true,
  interface_animations: true,
  media_preload: true,
  background_updates: true,
};

function withAppearanceDefaults(row: Partial<UserAppearanceSettings>): UserAppearanceSettings {
  return {
    ...(APPEARANCE_DEFAULTS as any),
    ...(row as any),
  } as UserAppearanceSettings;
}

function withEnergyDefaults(row: Partial<UserEnergySaverSettings>): UserEnergySaverSettings {
  return {
    ...(ENERGY_DEFAULTS as any),
    ...(row as any),
  } as UserEnergySaverSettings;
}

export async function getOrCreateAppearanceSettings(userId: string): Promise<UserAppearanceSettings> {
  const { data: existing, error } = await supabaseAny
    .from("user_appearance_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (existing) return withAppearanceDefaults(existing as any);

  const { data, error: insertError } = await supabaseAny
    .from("user_appearance_settings")
    .insert({ user_id: userId })
    .select("*")
    .single();
  if (insertError) throw insertError;
  return withAppearanceDefaults(data as any);
}

export async function updateAppearanceSettings(
  _userId: string,
  patch: Partial<Omit<UserAppearanceSettings, "user_id" | "updated_at" | "created_at">>,
): Promise<UserAppearanceSettings> {
  const { data, error } = await supabaseAny.rpc("update_my_appearance_settings", {
    p_chat_theme_id: patch.chat_theme_id ?? null,
    p_chat_wallpaper_id: patch.chat_wallpaper_id ?? null,
    p_personal_color_primary: patch.personal_color_primary ?? null,
    p_personal_color_secondary: patch.personal_color_secondary ?? null,
    p_dark_mode_enabled: patch.dark_mode_enabled ?? null,
    p_dark_theme: patch.dark_theme ?? null,
    p_font_scale: patch.font_scale ?? null,
    p_message_corner_radius: patch.message_corner_radius ?? null,
    p_ui_animations_enabled: patch.ui_animations_enabled ?? null,
    p_stickers_emoji_animations_enabled: patch.stickers_emoji_animations_enabled ?? null,
    p_media_tap_navigation_enabled: patch.media_tap_navigation_enabled ?? null,
  });
  if (error) throw error;
  return withAppearanceDefaults(data as any);
}

export async function listAppIconCatalog(): Promise<AppIconCatalogItem[]> {
  const { data, error } = await supabaseAny
    .from("app_icon_catalog")
    .select("id, name, icon_url, is_premium, is_active, sort_order")
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as AppIconCatalogItem[];
}

export async function getOrCreateUserAppIconSelection(userId: string): Promise<string> {
  const { data: existing, error } = await supabaseAny
    .from("user_app_icon_selection")
    .select("icon_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (existing?.icon_id) return existing.icon_id as string;

  const { data, error: insertError } = await supabaseAny
    .from("user_app_icon_selection")
    .insert({ user_id: userId, icon_id: "main" })
    .select("icon_id")
    .single();
  if (insertError) throw insertError;
  return (data?.icon_id as string) ?? "main";
}

export async function setUserAppIconSelection(userId: string, iconId: string): Promise<void> {
  void userId;
  const { error } = await supabaseAny.rpc("set_my_app_icon_selection", {
    p_icon_id: iconId,
  });
  if (error) throw error;
}

export async function getOrCreateEnergySaverSettings(userId: string): Promise<UserEnergySaverSettings> {
  const { data: existing, error } = await supabaseAny
    .from("user_energy_saver_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (existing) return withEnergyDefaults(existing as any);

  const { data, error: insertError } = await supabaseAny
    .from("user_energy_saver_settings")
    .insert({ user_id: userId })
    .select("*")
    .single();
  if (insertError) throw insertError;
  return withEnergyDefaults(data as any);
}

export async function updateEnergySaverSettings(
  _userId: string,
  patch: Partial<Omit<UserEnergySaverSettings, "user_id" | "updated_at" | "created_at">>,
): Promise<UserEnergySaverSettings> {
  const { data, error } = await supabaseAny.rpc("update_my_energy_saver_settings", {
    p_mode: patch.mode ?? null,
    p_battery_threshold_percent: patch.battery_threshold_percent ?? null,
    p_autoplay_video: patch.autoplay_video ?? null,
    p_autoplay_gif: patch.autoplay_gif ?? null,
    p_animated_stickers: patch.animated_stickers ?? null,
    p_animated_emoji: patch.animated_emoji ?? null,
    p_interface_animations: patch.interface_animations ?? null,
    p_media_preload: patch.media_preload ?? null,
    p_background_updates: patch.background_updates ?? null,
  });
  if (error) throw error;
  return withEnergyDefaults(data as any);
}
