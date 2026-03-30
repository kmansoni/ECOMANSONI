/**
 * people-nearby Edge Function
 *
 * Endpoints:
 *  POST /people-nearby/update-location  { lat, lon, accuracy, visible }
 *  GET  /people-nearby/find?lat=X&lon=Y&radius=5000
 *  POST /people-nearby/hide
 *
 * Безопасность:
 *  - JWT обязателен
 *  - Координаты валидируются на сервере (lat ±90, lon ±180)
 *  - Rate limiting: update-location делегирован SECURITY DEFINER функции update_my_location
 *    которая проверяет cooldown 30 секунд в БД
 *  - find: вызывает SECURITY DEFINER find_people_nearby — не показывает забаненных
 *  - Ответ find обогащается профилем пользователя (display_name, avatar_url)
 *    через service client (только для видимых пользователей)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders } from "../_shared/utils.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  function jsonResponse(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  function errorResponse(message: string, status = 400): Response {
    return jsonResponse({ error: message }, status);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return errorResponse("Unauthorized", 401);
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // Получить user id из токена
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return errorResponse("Unauthorized", 401);
  }

  const url = new URL(req.url);
  const pathname = url.pathname;

  // ---------------------------------------------------------------------------
  // POST /people-nearby/update-location
  // ---------------------------------------------------------------------------
  if (req.method === "POST" && pathname.endsWith("/update-location")) {
    let body: { lat?: number; lon?: number; accuracy?: number; visible?: boolean };
    try {
      body = await req.json();
    } catch {
      return errorResponse("Invalid JSON");
    }

    const { lat, lon, accuracy = 0, visible = true } = body ?? {};

    if (typeof lat !== "number" || typeof lon !== "number") {
      return errorResponse("lat and lon are required numbers");
    }
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return errorResponse("Invalid coordinates");
    }

    const { error } = await userClient.rpc("update_my_location", {
      p_lat: lat,
      p_lon: lon,
      p_accuracy: accuracy,
      p_visible: visible,
      p_expires_hours: null,
    });

    if (error) {
      // Rate limit error из PostgreSQL RAISE EXCEPTION
      if (error.message?.includes("Rate limit")) {
        return errorResponse(error.message, 429);
      }
      return errorResponse(error.message, 500);
    }

    return jsonResponse({ ok: true });
  }

  // ---------------------------------------------------------------------------
  // POST /people-nearby/hide
  // ---------------------------------------------------------------------------
  if (req.method === "POST" && pathname.endsWith("/hide")) {
    const { error } = await userClient.rpc("hide_my_location");
    if (error) return errorResponse(error.message, 500);
    return jsonResponse({ ok: true });
  }

  // ---------------------------------------------------------------------------
  // GET /people-nearby/find?lat=X&lon=Y&radius=5000
  // ---------------------------------------------------------------------------
  if (req.method === "GET" && pathname.endsWith("/find")) {
    const lat = parseFloat(url.searchParams.get("lat") ?? "");
    const lon = parseFloat(url.searchParams.get("lon") ?? "");
    const radius = Math.min(parseInt(url.searchParams.get("radius") ?? "5000"), 50000);

    if (isNaN(lat) || isNaN(lon)) {
      return errorResponse("lat and lon query params are required");
    }
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return errorResponse("Invalid coordinates");
    }

    // 1. Найти ближайших пользователей через SECURITY DEFINER функцию
    const { data: nearby, error: findError } = await userClient.rpc("find_people_nearby", {
      p_user_id: user.id,
      p_lat: lat,
      p_lon: lon,
      p_radius_meters: radius,
      p_limit: 50,
    });

    if (findError) {
      return errorResponse(findError.message, 500);
    }

    if (!nearby || (nearby as unknown[]).length === 0) {
      return jsonResponse({ users: [] });
    }

    // 2. Обогатить профилями через service client
    const userIds = (nearby as Array<{ user_id: string; distance_meters: number; last_updated: string }>)
      .map(r => r.user_id);

    const { data: profiles } = await serviceClient
      .from("profiles")
      .select("id, display_name, avatar_url")
      .in("id", userIds);

    const profileMap = new Map(
      (profiles ?? []).map((p: { id: string; display_name: string | null; avatar_url: string | null }) => [p.id, p]),
    );

    const result = (nearby as Array<{ user_id: string; distance_meters: number; last_updated: string }>).map(row => ({
      id: row.user_id,
      distanceMeters: Math.round(row.distance_meters),
      lastUpdated: row.last_updated,
      displayName: profileMap.get(row.user_id)?.display_name ?? "Пользователь",
      avatarUrl: profileMap.get(row.user_id)?.avatar_url ?? null,
    }));

    return jsonResponse({ users: result });
  }

  return errorResponse("Not found", 404);
});
