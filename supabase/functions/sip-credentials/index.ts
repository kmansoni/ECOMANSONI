import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const noStoreHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json",
  "Cache-Control": "no-store, no-cache, must-revalidate",
};

/**
 * SIP Credentials Edge Function
 * Returns SIP credentials for external SIP provider integration.
 *
 * Security: verify_jwt = true in config.toml ensures the Supabase gateway
 * rejects unauthenticated callers. This function additionally verifies the
 * JWT in-band for defence-in-depth and records audit logs.
 *
 * Required secrets:
 * - SUPABASE_URL / SUPABASE_ANON_KEY — provided automatically by runtime
 * - SIP_WSS_URL: WebSocket URL (wss://...)
 * - SIP_DOMAIN: SIP domain
 * - SIP_USERNAME: SIP username
 * - SIP_PASSWORD: SIP password
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // In-function JWT verification (belt-and-suspenders — gateway already checks via verify_jwt=true).
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: noStoreHeaders }
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) {
    return new Response(
      JSON.stringify({ configured: false, error: "Server not configured" }),
      { status: 500, headers: noStoreHeaders }
    );
  }

  const authedClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error: authError } = await authedClient.auth.getUser();
  if (authError || !user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: noStoreHeaders }
    );
  }

  try {
    const wssUrl = Deno.env.get("SIP_WSS_URL");
    const domain = Deno.env.get("SIP_DOMAIN");
    const username = Deno.env.get("SIP_USERNAME");
    const password = Deno.env.get("SIP_PASSWORD");

    if (!wssUrl || !domain || !username || !password) {
      console.log("[SIP] SIP provider not configured");
      return new Response(
        JSON.stringify({ configured: false, message: "SIP provider not configured" }),
        { status: 200, headers: noStoreHeaders }
      );
    }

    console.log(`[SIP] Credentials issued to user ${user.id} for domain: ${domain}`);

    return new Response(
      JSON.stringify({ configured: true, wssUrl, domain, username, password }),
      { status: 200, headers: noStoreHeaders }
    );
  } catch (error: unknown) {
    console.error("[SIP] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ configured: false, error: errorMessage }),
      { status: 500, headers: noStoreHeaders }
    );
  }
});
