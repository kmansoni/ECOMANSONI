import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type ActorType = "user" | "device" | "ip" | "org" | "service";
export type RiskTier = "A" | "B" | "C" | "D";

type SupabaseClient = ReturnType<typeof createClient>;

type TrustProfileRow = {
  actor_type: ActorType;
  actor_id: string;
  trust_score: number;
  risk_tier: RiskTier;
  enforcement_level: string;
  updated_at: string;
};

type RateLimitConfigRow = {
  scope: string;
  tier: RiskTier | null;
  action: string;
  algorithm: "token_bucket" | "fixed_window" | "sliding_window";
  limit_value: number;
  window_seconds: number;
  burst: number | null;
  cost_per_action: number;
  enabled: boolean;
};

export type RateLimitResult =
  | { allowed: true; tier: RiskTier; limit_value: number; window_seconds: number }
  | { allowed: false; tier: RiskTier; retry_after_seconds: number; limit_value: number; window_seconds: number };

export async function getTrustTier(
  supabase: SupabaseClient,
  actorType: ActorType,
  actorId: string,
): Promise<{ tier: RiskTier; enforcement_level?: string }>
{
  const { data, error } = await supabase
    .from("trust_profiles")
    .select("actor_type, actor_id, trust_score, risk_tier, enforcement_level, updated_at")
    .eq("actor_type", actorType)
    .eq("actor_id", actorId)
    .maybeSingle<TrustProfileRow>();

  if (error) {
    // fail-open into normal tier
    return { tier: "B" };
  }

  if (!data) return { tier: "B" };
  return { tier: data.risk_tier, enforcement_level: data.enforcement_level };
}

async function getRateLimitConfig(
  supabase: SupabaseClient,
  tier: RiskTier,
  action: string,
): Promise<RateLimitConfigRow | null>
{
  const tierRes = await supabase
    .from("rate_limit_configs")
    .select("scope,tier,action,algorithm,limit_value,window_seconds,burst,cost_per_action,enabled")
    .eq("enabled", true)
    .eq("scope", "tier")
    .eq("tier", tier)
    .eq("action", action)
    .maybeSingle<RateLimitConfigRow>();

  if (!tierRes.error && tierRes.data) return tierRes.data;

  const globalRes = await supabase
    .from("rate_limit_configs")
    .select("scope,tier,action,algorithm,limit_value,window_seconds,burst,cost_per_action,enabled")
    .eq("enabled", true)
    .eq("scope", "global")
    .is("tier", null)
    .eq("action", action)
    .maybeSingle<RateLimitConfigRow>();

  if (globalRes.error || !globalRes.data) return null;
  return globalRes.data;
}

export async function enforceRateLimit(
  supabase: SupabaseClient,
  params: {
    actorType: ActorType;
    actorId: string;
    action: string;
    requestId?: string | null;
    context?: Record<string, unknown>;
  },
): Promise<RateLimitResult>
{
  // Phase 1 EPIC L: Canary rollout check (feature flag)
  if (params.actorType === "user") {
    const { data: flagEnabled } = await supabase.rpc<boolean>("is_feature_enabled_for_user_v1", {
      p_flag_name: "rate_limit_enforcement",
      p_user_id: params.actorId,
    });

    if (!flagEnabled) {
      // Skip enforcement for users not in rollout bucket
      return { allowed: true, tier: "B", limit_value: 0, window_seconds: 0 };
    }
  }

  const { tier, enforcement_level } = await getTrustTier(supabase, params.actorType, params.actorId);

  // Hard stop if we ever introduce E5-style blocks (kept for forward-compat)
  if (enforcement_level === "E5") {
    return {
      allowed: false,
      tier,
      retry_after_seconds: 3600,
      limit_value: 0,
      window_seconds: 3600,
    };
  }

  const cfg = await getRateLimitConfig(supabase, tier, params.action);
  if (!cfg) {
    // No config => allow
    return { allowed: true, tier, limit_value: 0, window_seconds: 0 };
  }

  const windowSeconds = Math.max(1, cfg.window_seconds || 60);
  const limitValue = Math.max(1, cfg.limit_value || 1);

  // DB-only fixed window approximation (works without Redis in Edge Functions)
  const windowStartIso = new Date(Date.now() - windowSeconds * 1000).toISOString();

  const { count, error: countErr } = await supabase
    .from("rate_limit_audits")
    .select("audit_id", { count: "exact", head: true })
    .eq("actor_type", params.actorType)
    .eq("actor_id", params.actorId)
    .eq("action", params.action)
    .eq("allowed", true)
    .gte("created_at", windowStartIso);

  const used = countErr ? 0 : (count ?? 0);
  const allowed = used < limitValue;

  // Always write audit (best-effort)
  await supabase.from("rate_limit_audits").insert({
    actor_type: params.actorType,
    actor_id: params.actorId,
    action: params.action,
    allowed,
    tokens_available: null,
    tokens_consumed: allowed ? 1 : 0,
    request_id: params.requestId ?? null,
    context: params.context ?? null,
  });

  if (allowed) {
    return { allowed: true, tier, limit_value: limitValue, window_seconds: windowSeconds };
  }

  return {
    allowed: false,
    tier,
    retry_after_seconds: windowSeconds,
    limit_value: limitValue,
    window_seconds: windowSeconds,
  };
}
