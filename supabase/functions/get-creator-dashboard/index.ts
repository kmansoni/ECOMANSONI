/**
 * get-creator-dashboard — Creator analytics dashboard Edge Function.
 *
 * Returns aggregated statistics for a content creator including:
 * - Total metrics across all reels (reach, engagement, watch quality)
 * - Average metrics per reel
 * - Audience insights (followers, growth)
 * - Top performing reel
 *
 * Security:
 * - JWT required; user can only access their own data
 * - RLS enforced via auth.uid() = creator_id check
 */

/// <reference path="../_shared/edge-runtime-types.d.ts" />

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors, enforceCors } from "../_shared/utils.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DashboardRequest {
  creator_id: string;
  days?: number;
}

interface DashboardResponse {
  totals: {
    reels: number;
    impressions: number;
    likes: number;
    comments: number;
    saves: number;
    shares: number;
    watched: number;
    unique_viewers: number;
    strong_reels: number;
  };
  averages: {
    impressions_per_reel: number;
    watched_rate: number;
    watches_per_reel: number;
  };
  audience: {
    followers: number;
    growth_7d: number;
    growth_30d: number;
  };
  top_reel: {
    reel_id: string | null;
    impressions: number;
    likes_count: number;
    comments_count: number;
  };
  audience_gender?: Record<string, number>;
  audience_age?: Record<string, number>;
  audience_locations?: {
    countries: Array<{ name: string; pct: number }>;
    cities: Array<{ name: string; pct: number }>;
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_DAYS = 30;
const MAX_DAYS = 180;

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

serve(async (req: Request): Promise<Response> => {
  const corsPreflight = handleCors(req);
  if (corsPreflight) return corsPreflight;

  const corsDenied = enforceCors(req);
  if (corsDenied) return corsDenied;

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, req);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, 401, req);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) {
    return json({ error: "Server misconfiguration" }, 500, req);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return json({ error: "Unauthorized" }, 401, req);
  }

  let body: DashboardRequest;
  try {
    body = await req.json() as DashboardRequest;
  } catch {
    return json({ error: "Invalid JSON body" }, 400, req);
  }

  const creatorId = body.creator_id;
  if (!creatorId || typeof creatorId !== "string") {
    return json({ error: "creator_id is required" }, 400, req);
  }

  if (creatorId !== user.id) {
    return json({ error: "Forbidden: can only access own dashboard" }, 403, req);
  }

  const days = Math.min(
    Math.max(1, Number(body.days) || DEFAULT_DAYS),
    MAX_DAYS
  );

  const [metricsResult, genderResult, ageResult, locationsResult] = await Promise.all([
    supabase.rpc("get_creator_dashboard_v1", { p_creator_id: creatorId }),
    supabase.rpc("get_audience_gender_v1", { p_creator_id: creatorId, p_days: days }),
    supabase.rpc("get_audience_age_v1", { p_creator_id: creatorId, p_days: days }),
    supabase.rpc("get_audience_locations_v1", { p_creator_id: creatorId, p_days: days }),
  ]);

  if (metricsResult.error) {
    console.error("[get-creator-dashboard] RPC error:", metricsResult.error.message);
    return json({ error: "Dashboard data unavailable" }, 503, req);
  }

  const rawMetrics = metricsResult.data as Record<string, unknown> | null;

  const response: DashboardResponse = {
    totals: {
      reels: Number(rawMetrics?.totals?.reels ?? 0),
      impressions: Number(rawMetrics?.totals?.impressions ?? 0),
      likes: Number(rawMetrics?.totals?.likes ?? 0),
      comments: Number(rawMetrics?.totals?.comments ?? 0),
      saves: Number(rawMetrics?.totals?.saves ?? 0),
      shares: Number(rawMetrics?.totals?.shares ?? 0),
      watched: Number(rawMetrics?.totals?.watched ?? 0),
      unique_viewers: Number(rawMetrics?.totals?.unique_viewers ?? 0),
      strong_reels: 0,
    },
    averages: {
      impressions_per_reel: Number(rawMetrics?.averages?.impressions_per_reel ?? 0),
      watched_rate: Number(rawMetrics?.averages?.watched_rate ?? 0),
      watches_per_reel: Number((rawMetrics?.totals?.watched ?? 0) / Math.max(1, Number(rawMetrics?.totals?.reels ?? 1))),
    },
    audience: {
      followers: Number(rawMetrics?.audience?.followers ?? 0),
      growth_7d: Number(rawMetrics?.audience?.growth_7d ?? 0),
      growth_30d: Number(rawMetrics?.audience?.growth_30d ?? 0),
    },
    top_reel: {
      reel_id: rawMetrics?.top_reel?.reel_id ? String(rawMetrics.top_reel.reel_id) : null,
      impressions: Number(rawMetrics?.top_reel?.impressions ?? 0),
      likes_count: 0,
      comments_count: 0,
    },
  };

  const { count: strongReelsCount } = await supabase
    .from("reel_metrics")
    .select("reel_id", { count: "exact" })
    .eq("author_id", creatorId)
    .gte("watched_rate", 70);

  response.totals.strong_reels = strongReelsCount ?? 0;

  const topReelId = rawMetrics?.top_reel?.reel_id as string | undefined;
  if (topReelId) {
    const { data: topReelData } = await supabase
      .from("reel_metrics")
      .select("likes, comments, impressions")
      .eq("reel_id", topReelId)
      .single();

    if (topReelData) {
      response.top_reel.likes_count = Number(topReelData.likes ?? 0);
      response.top_reel.comments_count = Number(topReelData.comments ?? 0);
    }
  }

  if (!genderResult.error && genderResult.data) {
    const genderData = genderResult.data as Record<string, unknown>;
    response.audience_gender = {
      female: Number(genderData.female ?? 0),
      male: Number(genderData.male ?? 0),
      unknown: Number(genderData.unknown ?? 0),
    };
  }

  if (!ageResult.error && ageResult.data) {
    const ageData = ageResult.data as Record<string, unknown>;
    response.audience_age = {
      "13-17": Number(ageData["13-17"] ?? 0),
      "18-24": Number(ageData["18-24"] ?? 0),
      "25-34": Number(ageData["25-34"] ?? 0),
      "35-44": Number(ageData["35-44"] ?? 0),
      "45-54": Number(ageData["45-54"] ?? 0),
      "55-64": Number(ageData["55-64"] ?? 0),
      "65+": Number(ageData["65+"] ?? 0),
      unknown: Number(ageData.unknown ?? 0),
    };
  }

  if (!locationsResult.error && locationsResult.data) {
    const locationsData = locationsResult.data as Record<string, unknown>;
    response.audience_locations = {
      countries: locationsData.countries as Array<{ name: string; pct: number }> ?? [],
      cities: locationsData.cities as Array<{ name: string; pct: number }> ?? [],
    };
  }

  return json(response, 200, req);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function json(body: unknown, status: number, req: Request): Response {
  const origin = req.headers.get("origin");
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(origin), "Content-Type": "application/json" },
  });
}