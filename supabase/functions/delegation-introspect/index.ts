/**
 * Phase 1 Trust-lite: Delegation token introspection
 *
 * Validates a delegation JWT and returns non-secret claims when active.
 * This is the canonical validation path for services.
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getBearer,
  requireEnv,
  validateDelegationInDb,
  verifyDelegationJwtHs256,
} from "../_shared/delegation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

    const token = getBearer(req);
    const { payload, alg } = await verifyDelegationJwtHs256(token);
    if (alg !== "HS256") return json(400, { error: "Unsupported alg" });

    const supabase = createClient(supabaseUrl, serviceKey);
    const { delegation_id } = await validateDelegationInDb({ supabase, token, payload });

    return json(200, {
      ok: true,
      delegation_id,
      sub: payload.sub,
      tenant_id: payload.tenant_id,
      service_id: payload.service_id,
      scopes: payload.scopes,
      exp: payload.exp,
      iat: payload.iat,
      jti: payload.jti,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Authorization")) return json(401, { error: "Unauthorized" });
    return json(401, { error: "Invalid or expired token" });
  }
});
