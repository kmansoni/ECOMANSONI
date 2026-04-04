import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders } from "../_shared/utils.ts";

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get("origin");

  try {
    const authHeader = req.headers.get("authorization");
    const cronSecret = Deno.env.get("CRON_SECRET");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const token = authHeader?.replace(/^Bearer\s+/i, "");
    if (!token || (cronSecret ? token !== cronSecret : token !== serviceRoleKey)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCorsHeaders(origin), "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Вызываем хранимую процедуру обработки исчезающих сообщений
    const { data, error } = await supabase.rpc("process_disappearing_messages");

    if (error) {
      console.error("process_disappearing_messages error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...getCorsHeaders(origin), "Content-Type": "application/json" },
      });
    }

    const affectedCount = data as number;

    // Публикуем Realtime-событие если были обработаны сообщения
    if (affectedCount > 0) {
      await supabase
        .channel("disappearing-messages")
        .send({
          type: "broadcast",
          event: "messages_disappeared",
          payload: { count: affectedCount, processed_at: new Date().toISOString() },
        });
    }

    return new Response(
      JSON.stringify({ ok: true, affected: affectedCount }),
      {
        headers: { ...getCorsHeaders(origin), "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...getCorsHeaders(origin), "Content-Type": "application/json" },
    });
  }
});
