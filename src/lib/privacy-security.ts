import { supabase } from "@/lib/supabase";

export type PrivacyAudience =
  | "everyone"
  | "contacts"
  | "nobody"
  | "contacts_and_premium"
  | "paid_messages";

export type PrivacyP2PMode = "always" | "contacts" | "never";

export type PrivacyRuleKey =
  | "phone_number"
  | "last_seen"
  | "profile_photos"
  | "bio"
  | "gifts"
  | "birthday"
  | "saved_music"
  | "forwarded_messages"
  | "calls"
  | "voice_messages"
  | "messages"
  | "invites";

export type PrivacyRule = {
  user_id: string;
  rule_key: PrivacyRuleKey;
  audience: PrivacyAudience;
  phone_discovery_audience: "everyone" | "contacts";
  p2p_mode: PrivacyP2PMode;
  hide_read_time: boolean;
  gift_badge_enabled: boolean;
  gift_allow_common: boolean;
  gift_allow_rare: boolean;
  gift_allow_unique: boolean;
  gift_allow_channels: boolean;
  gift_allow_premium: boolean;
  ios_call_integration: boolean;
  updated_at: string;
  created_at: string;
};

export type PrivacyRuleExceptionMode = "always_allow" | "never_allow";

export type PrivacyRuleException = {
  id: string;
  user_id: string;
  rule_key: PrivacyRuleKey;
  mode: PrivacyRuleExceptionMode;
  target_user_id: string;
  created_at: string;
};

export type AuthorizedSite = {
  id: string;
  user_id: string;
  site_name: string;
  domain: string;
  browser: string | null;
  os: string | null;
  location_label: string | null;
  last_active_at: string;
  created_at: string;
  revoked_at: string | null;
};

export type UserSecuritySettings = {
  user_id: string;
  app_passcode_hash: string | null;
  cloud_password_hash: string | null;
  passkey_enabled: boolean;
  updated_at: string;
  created_at: string;
};

export const PRIVACY_RULE_DEFAULTS: Record<PrivacyRuleKey, Partial<PrivacyRule>> = {
  phone_number: { audience: "nobody", phone_discovery_audience: "everyone" },
  last_seen: { audience: "everyone", hide_read_time: false },
  profile_photos: { audience: "everyone" },
  bio: { audience: "everyone" },
  gifts: {
    audience: "everyone",
    gift_badge_enabled: false,
    gift_allow_common: true,
    gift_allow_rare: true,
    gift_allow_unique: true,
    gift_allow_channels: true,
    gift_allow_premium: true,
  },
  birthday: { audience: "contacts" },
  saved_music: { audience: "everyone" },
  forwarded_messages: { audience: "everyone" },
  calls: { audience: "everyone", p2p_mode: "always", ios_call_integration: true },
  voice_messages: { audience: "everyone" },
  messages: { audience: "everyone" },
  invites: { audience: "contacts" },
};

const supabaseAny = supabase as any;

function allRuleKeys(): PrivacyRuleKey[] {
  return Object.keys(PRIVACY_RULE_DEFAULTS) as PrivacyRuleKey[];
}

function makeDefaultRows(userId: string): Array<Partial<PrivacyRule>> {
  return allRuleKeys().map((ruleKey) => ({
    user_id: userId,
    rule_key: ruleKey,
    audience: "everyone",
    phone_discovery_audience: "everyone",
    p2p_mode: "always",
    hide_read_time: false,
    gift_badge_enabled: false,
    gift_allow_common: true,
    gift_allow_rare: true,
    gift_allow_unique: true,
    gift_allow_channels: true,
    gift_allow_premium: true,
    ios_call_integration: true,
    ...(PRIVACY_RULE_DEFAULTS[ruleKey] ?? {}),
  }));
}

export async function getOrCreatePrivacyRules(userId: string): Promise<PrivacyRule[]> {
  await supabaseAny
    .from("privacy_rules")
    .upsert(makeDefaultRows(userId), { onConflict: "user_id,rule_key", ignoreDuplicates: true });

  const { data, error } = await supabaseAny
    .from("privacy_rules")
    .select("*")
    .eq("user_id", userId)
    .order("rule_key");

  if (error) throw error;
  return (data ?? []) as PrivacyRule[];
}

export async function updatePrivacyRule(
  userId: string,
  ruleKey: PrivacyRuleKey,
  patch: Partial<Omit<PrivacyRule, "user_id" | "rule_key" | "created_at" | "updated_at">>,
): Promise<PrivacyRule> {
  const { data, error } = await supabaseAny
    .from("privacy_rules")
    .update(patch)
    .eq("user_id", userId)
    .eq("rule_key", ruleKey)
    .select("*")
    .single();
  if (error) throw error;
  return data as PrivacyRule;
}

export async function listPrivacyRuleExceptions(userId: string, ruleKey: PrivacyRuleKey): Promise<PrivacyRuleException[]> {
  const { data, error } = await supabaseAny
    .from("privacy_rule_exceptions")
    .select("id, user_id, rule_key, mode, target_user_id, created_at")
    .eq("user_id", userId)
    .eq("rule_key", ruleKey)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PrivacyRuleException[];
}

export async function upsertPrivacyRuleException(
  userId: string,
  ruleKey: PrivacyRuleKey,
  mode: PrivacyRuleExceptionMode,
  targetUserId: string,
): Promise<void> {
  const { error } = await supabaseAny.from("privacy_rule_exceptions").upsert(
    {
      user_id: userId,
      rule_key: ruleKey,
      mode,
      target_user_id: targetUserId,
    },
    { onConflict: "user_id,rule_key,mode,target_user_id" },
  );
  if (error) throw error;
}

export async function deletePrivacyRuleException(id: string, userId: string): Promise<void> {
  const { error } = await supabaseAny.from("privacy_rule_exceptions").delete().eq("id", id).eq("user_id", userId);
  if (error) throw error;
}

export async function getOrCreateUserSecuritySettings(userId: string): Promise<UserSecuritySettings> {
  const { data: existing, error } = await supabaseAny
    .from("user_security_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (existing) return existing as UserSecuritySettings;

  const { data: created, error: insertError } = await supabaseAny
    .from("user_security_settings")
    .insert({ user_id: userId })
    .select("*")
    .single();
  if (insertError) throw insertError;
  return created as UserSecuritySettings;
}

export async function updateUserSecuritySettings(
  userId: string,
  patch: Partial<Omit<UserSecuritySettings, "user_id" | "created_at" | "updated_at">>,
): Promise<UserSecuritySettings> {
  const { data, error } = await supabaseAny
    .from("user_security_settings")
    .update(patch)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) throw error;
  return data as UserSecuritySettings;
}

export async function listAuthorizedSites(userId: string): Promise<AuthorizedSite[]> {
  const { data, error } = await supabaseAny
    .from("authorized_sites")
    .select("*")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .order("last_active_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as AuthorizedSite[];
}

export async function revokeAuthorizedSite(userId: string, siteId: string): Promise<void> {
  const { error } = await supabaseAny
    .from("authorized_sites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", siteId)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function revokeAllAuthorizedSites(userId: string): Promise<void> {
  const { error } = await supabaseAny
    .from("authorized_sites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("revoked_at", null);
  if (error) throw error;
}

