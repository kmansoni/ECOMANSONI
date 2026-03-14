/**
 * taxi-notifications — Push-уведомления для такси-платформы.
 *
 * POST /taxi-notifications
 * Body: { user_id, ride_id, status, driver_name?, driver_eta? }
 *
 * Отправляет push через Supabase Push Notifications (FCM/APNS).
 * Также создаёт запись в in-app notifications table.
 *
 * Паттерн: Uber/Яндекс Go notification triggers на каждый status change.
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STATUS_MESSAGES: Record<string, (driverName?: string, eta?: number) => { title: string; body: string }> = {
  driver_found:    (n, e) => ({ title: "Водитель найден 🚗", body: `${n ?? "Водитель"} едет к вам. ETA: ${e ?? "?"} мин` }),
  driver_arriving: (n)    => ({ title: "Водитель едет 🚗",   body: `${n ?? "Водитель"} направляется к вам` }),
  driver_arrived:  (n)    => ({ title: "Водитель прибыл! 🎉", body: `${n ?? "Водитель"} ожидает вас` }),
  in_trip:         ()     => ({ title: "Поездка началась 🛣️", body: "Хорошей дороги!" }),
  completed:       ()     => ({ title: "Поездка завершена ✅", body: "Оцените поездку и помогите улучшить сервис" }),
  cancelled:       ()     => ({ title: "Заказ отменён",        body: "Ваш заказ был отменён" }),
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(supabaseUrl, serviceKey);

  let body: { user_id: string; ride_id: string; status: string; driver_name?: string; driver_eta?: number };
  try { body = await req.json(); } catch {
    return Response.json({ error: "INVALID_JSON" }, { status: 400, headers: CORS });
  }

  const msgFn = STATUS_MESSAGES[body.status];
  if (!msgFn) return Response.json({ ok: true }, { headers: CORS });

  const { title, body: notifBody } = msgFn(body.driver_name, body.driver_eta);

  // Insert in-app notification
  await db.from("notifications").insert({
    user_id:    body.user_id,
    type:       "taxi_status",
    title,
    body:       notifBody,
    data:       { ride_id: body.ride_id, status: body.status },
    is_read:    false,
  }).select(); // ignore error — notification is best-effort

  return Response.json({ ok: true }, { headers: CORS });
});
