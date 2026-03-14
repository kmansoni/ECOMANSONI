/**
 * taxi-dispatch — Supabase Edge Function для матчинга заказа с водителем.
 *
 * POST /taxi-dispatch
 * Body: { order_id, pickup_lat, pickup_lng, tariff, passenger_rating? }
 *
 * Алгоритм:
 *   1. JWT validation → passenger_id = auth.uid()
 *   2. Validate ride belongs to passenger, status = searching_driver
 *   3. Find nearest available drivers in expanding radius [2, 3, 5] km
 *   4. Score: 0.6*(1-dist/radius) + 0.3*(rating/5) + 0.1*(acceptance/100)
 *   5. Atomic assignment via taxi_assign_order_to_driver() stored proc
 *
 * Security:
 *   - passenger_id from JWT only, never from body
 *   - SKIP LOCKED pattern для race condition protection
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const W_DIST = 0.6, W_RATE = 0.3, W_ACCEPT = 0.1;
const STALE_SEC = 30;
const RADII = [2.0, 3.0, 5.0];

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey     = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Auth
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return Response.json({ error: "UNAUTHORIZED" }, { status: 401, headers: CORS });

  const anonClient  = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const serviceClient = createClient(supabaseUrl, serviceKey);

  const { data: { user }, error: authErr } = await anonClient.auth.getUser();
  if (authErr || !user) return Response.json({ error: "UNAUTHORIZED" }, { status: 401, headers: CORS });

  // Parse body
  let body: { order_id: string; pickup_lat: number; pickup_lng: number; tariff: string };
  try { body = await req.json(); } catch {
    return Response.json({ error: "INVALID_JSON" }, { status: 400, headers: CORS });
  }
  const { order_id, pickup_lat, pickup_lng, tariff } = body;
  if (!order_id || !pickup_lat || !pickup_lng || !tariff) {
    return Response.json({ error: "MISSING_PARAMS" }, { status: 400, headers: CORS });
  }

  // Validate ride
  const { data: ride } = await serviceClient
    .from("taxi_rides")
    .select("id, passenger_id, status")
    .eq("id", order_id)
    .eq("passenger_id", user.id)
    .eq("status", "searching_driver")
    .maybeSingle();

  if (!ride) return Response.json({ error: "RIDE_NOT_FOUND" }, { status: 404, headers: CORS });

  const staleTs = new Date(Date.now() - STALE_SEC * 1000).toISOString();

  for (const radius of RADII) {
    const dLat = radius / 111;
    const dLng = radius / (111 * Math.cos(pickup_lat * Math.PI / 180));

    const { data: drivers } = await serviceClient
      .from("taxi_driver_locations")
      .select("driver_id, lat, lng, taxi_drivers!inner(rating, acceptance_rate, status, car_class)")
      .eq("taxi_drivers.status", "available")
      .eq("taxi_drivers.car_class", tariff)
      .gte("lat", pickup_lat - dLat).lte("lat", pickup_lat + dLat)
      .gte("lng", pickup_lng - dLng).lte("lng", pickup_lng + dLng)
      .gte("updated_at", staleTs);

    if (!drivers?.length) continue;

    interface DriverRow { driver_id: string; lat: number; lng: number; taxi_drivers: { rating: number; acceptance_rate: number }[] }
    const scored = (drivers as unknown as DriverRow[])
      .map((d) => {
        const td = Array.isArray(d.taxi_drivers) ? d.taxi_drivers[0] : d.taxi_drivers;
        const dist = Math.sqrt((d.lat - pickup_lat) ** 2 + (d.lng - pickup_lng) ** 2) * 111;
        return {
          driver_id: d.driver_id,
          score: W_DIST * (1 - dist / radius) + W_RATE * (td.rating / 5) + W_ACCEPT * (td.acceptance_rate / 100),
        };
      })
      .sort((a, b) => b.score - a.score);

    const { error: assignErr } = await serviceClient.rpc("taxi_assign_order_to_driver", {
      p_order_id: order_id,
      p_driver_id: scored[0].driver_id,
    });

    if (!assignErr) {
      return Response.json({ success: true, driver_id: scored[0].driver_id }, { headers: CORS });
    }
  }

  // Mark no drivers — passenger will be notified via realtime
  await serviceClient
    .from("taxi_rides")
    .update({ status: "cancelled", cancellation_reason: "other", cancelled_by: "system", cancelled_at: new Date().toISOString() })
    .eq("id", order_id);

  return Response.json({ success: false, reason: "NO_DRIVERS_AVAILABLE" }, { headers: CORS });
});
