import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Вызываем хранимую процедуру обработки исчезающих сообщений
    const { data, error } = await supabase.rpc("process_disappearing_messages");

    if (error) {
      console.error("process_disappearing_messages error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
