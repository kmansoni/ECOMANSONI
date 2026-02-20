import { supabase } from "@/lib/supabase";

export type ThemePreference = "light" | "dark" | "system";

export type UserSettings = {
  user_id: string;

  theme: ThemePreference;
  language_code: string;
  font_scale: number;
  reduce_motion: boolean;
  high_contrast: boolean;

  push_notifications: boolean;
  likes_notifications: boolean;
  comments_notifications: boolean;
  followers_notifications: boolean;

  private_account: boolean;
  show_activity_status: boolean;

  branded_content_manual_approval: boolean;

  // Notifications (Telegram-like, in-app)
  notif_sound_id: string;
  notif_vibrate: boolean;
  notif_show_text: boolean;
  notif_show_sender: boolean;

  // Calls
  show_calls_tab: boolean;

  // Devices
  sessions_auto_terminate_days: number;
  messages_auto_delete_seconds: number;
  account_self_destruct_days: number;

  // Data & storage (Telegram-like)
  media_auto_download_enabled: boolean;
  media_auto_download_photos: boolean;
  media_auto_download_videos: boolean;
  media_auto_download_files: boolean;
  media_auto_download_files_max_mb: number;
  cache_auto_delete_days: number;
  cache_max_size_mb: number | null;

  created_at?: string;
  updated_at?: string;
};

function looksLikeMissingColumn(error: unknown) {
  const msg = String((error as any)?.message ?? error).toLowerCase();
  return msg.includes("column") && msg.includes("does not exist");
}

function withDataStorageDefaults(partial: Partial<UserSettings>): UserSettings {
  return {
    notif_sound_id: "rebound",
    notif_vibrate: false,
    notif_show_text: true,
    notif_show_sender: true,
    show_calls_tab: true,
    sessions_auto_terminate_days: 180,
    messages_auto_delete_seconds: 0,
    account_self_destruct_days: 180,
    media_auto_download_enabled: true,
    media_auto_download_photos: true,
    media_auto_download_videos: true,
    media_auto_download_files: true,
    media_auto_download_files_max_mb: 3,
    cache_auto_delete_days: 7,
    cache_max_size_mb: null,
    // existing defaults are handled by DB; for fallback we just spread what we got
    ...(partial as any),
  } as UserSettings;
}

const BASE_SETTINGS_SELECT =
  "user_id, theme, language_code, font_scale, reduce_motion, high_contrast, push_notifications, likes_notifications, comments_notifications, followers_notifications, private_account, show_activity_status, branded_content_manual_approval, notif_sound_id, notif_vibrate, notif_show_text, notif_show_sender, show_calls_tab, sessions_auto_terminate_days, messages_auto_delete_seconds, account_self_destruct_days, created_at, updated_at";

const supabaseAny = supabase as any;

export async function getOrCreateUserSettings(userId: string): Promise<UserSettings> {
  const { data: existing, error: selectError } = await supabaseAny
    .from("user_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (selectError) {
    if (looksLikeMissingColumn(selectError)) {
      const { data: base, error: baseErr } = await supabaseAny
        .from("user_settings")
        .select(BASE_SETTINGS_SELECT)
        .eq("user_id", userId)
        .maybeSingle();
      if (baseErr) throw selectError;
      if (base) return withDataStorageDefaults(base as any);
      // Continue to create row below.
    } else {
      throw selectError;
    }
  }

  if (existing) {
    return withDataStorageDefaults(existing as any);
  }

  const { data: inserted, error: insertError } = await supabaseAny
    .from("user_settings")
    .insert({ user_id: userId, theme: "dark" })
    .select("*")
    .single();

  if (insertError) {
    throw insertError;
  }

  return withDataStorageDefaults(inserted as any);
}

export async function updateUserSettings(
  userId: string,
  patch: Partial<Omit<UserSettings, "user_id" | "created_at" | "updated_at">>,
): Promise<UserSettings> {
  const { data, error } = await supabaseAny
    .from("user_settings")
    .update(patch)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) {
    if (looksLikeMissingColumn(error)) {
      // Try returning a base shape so the app can keep running until migrations are applied.
      const { data: base, error: baseErr } = await supabaseAny
        .from("user_settings")
        .select(BASE_SETTINGS_SELECT)
        .eq("user_id", userId)
        .single();
      if (baseErr) throw error;
      return withDataStorageDefaults(base as any);
    }
    throw error;
  }

  return withDataStorageDefaults(data as any);
}

export function subscribeToUserSettings(userId: string, onChange: (settings: UserSettings) => void) {
  const channel = supabase
    .channel(`user-settings:${userId}`)
    .on(
      "postgres_changes" as any,
      {
        event: "*",
        schema: "public",
        table: "user_settings",
        filter: `user_id=eq.${userId}`,
      },
      (payload: any) => {
        if (payload?.new) {
          onChange(payload.new as UserSettings);
        }
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export type CreatorInsights = {
  days: number;
  since: string;
  views_total: number;
  views_non_followers: number;
  views_non_followers_pct: number;
  followers_total: number;
  followers_gained: number;
  reels_total: number;
  likes_total: number;
  comments_total: number;
  views_by_day: Array<{ day: string; views: number }>;
  views_by_hour: Array<{ hour: number; views: number }>;
  top_reels: Array<{
    reel_id: string;
    views: number;
    likes_count: number;
    comments_count: number;
    created_at: string;
    thumbnail_url: string | null;
    description: string | null;
  }>;
  followers_gender: { male: number; female: number; unknown: number };
};

export async function getCreatorInsights(days = 30): Promise<CreatorInsights> {
  const { data, error } = await supabaseAny.rpc("get_creator_insights", { p_days: days });
  if (error) {
    throw error;
  }
  return data as CreatorInsights;
}

export type BrandedApprovedAuthor = {
  id: string;
  brand_user_id: string;
  author_user_id: string;
  approved_at: string;
};

export async function listBrandedApprovedAuthors(brandUserId: string): Promise<BrandedApprovedAuthor[]> {
  const { data, error } = await supabaseAny
    .from("branded_content_approved_authors")
    .select("id, brand_user_id, author_user_id, approved_at")
    .eq("brand_user_id", brandUserId)
    .order("approved_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as BrandedApprovedAuthor[];
}

export async function approveBrandedAuthor(brandUserId: string, authorUserId: string): Promise<void> {
  const { error } = await supabaseAny
    .from("branded_content_approved_authors")
    .insert({ brand_user_id: brandUserId, author_user_id: authorUserId });
  if (error) throw error;
}

export async function revokeBrandedAuthor(brandUserId: string, authorUserId: string): Promise<void> {
  const { error } = await supabaseAny
    .from("branded_content_approved_authors")
    .delete()
    .eq("brand_user_id", brandUserId)
    .eq("author_user_id", authorUserId);
  if (error) throw error;
}

export type BrandedPartnerRequestStatus = "pending" | "approved" | "rejected" | "cancelled";

export type BrandedPartnerRequest = {
  id: string;
  brand_user_id: string;
  partner_user_id: string;
  message: string | null;
  status: BrandedPartnerRequestStatus;
  created_at: string;
  decided_at: string | null;
};

export async function createBrandedPartnerRequest(
  brandUserId: string,
  partnerUserId: string,
  message?: string,
): Promise<void> {
  const { error } = await supabaseAny
    .from("branded_content_partner_requests")
    .insert({
      brand_user_id: brandUserId,
      partner_user_id: partnerUserId,
      message: message ?? null,
    });
  if (error) throw error;
}

export async function listOutgoingBrandedPartnerRequests(brandUserId: string): Promise<BrandedPartnerRequest[]> {
  const { data, error } = await supabaseAny
    .from("branded_content_partner_requests")
    .select("*")
    .eq("brand_user_id", brandUserId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as BrandedPartnerRequest[];
}

export async function listIncomingBrandedPartnerRequests(partnerUserId: string): Promise<BrandedPartnerRequest[]> {
  const { data, error } = await supabaseAny
    .from("branded_content_partner_requests")
    .select("*")
    .eq("partner_user_id", partnerUserId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as BrandedPartnerRequest[];
}

export async function decideBrandedPartnerRequest(
  requestId: string,
  status: Exclude<BrandedPartnerRequestStatus, "pending">,
): Promise<void> {
  const { error } = await supabaseAny
    .from("branded_content_partner_requests")
    .update({ status, decided_at: new Date().toISOString() })
    .eq("id", requestId);
  if (error) throw error;
}
