/**
 * Phase 1 Trust-lite: Delegation token consumer for dm:read
 *
 * Reads messages from a DM conversation using a delegation JWT.
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getBearer,
  hasScope,
  requireEnv,
  validateDelegationInDb,
  verifyDelegationJwtHs256,
} from "../_shared/delegation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-debug-db-verify",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RequestBody = {
  conversation_id: string;
  before_seq?: number | null;
  limit?: number | null;
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

    if (!hasScope(payload.scopes, "dm:read")) {
      return json(403, { error: "Missing scope: dm:read" });
    }

    const body = (await req.json()) as RequestBody;
    if (!body?.conversation_id) return json(400, { error: "Missing conversation_id" });

    const supabase = createClient(supabaseUrl, serviceKey);

    try {
      await validateDelegationInDb({ supabase, token, payload });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return json(401, { error: msg });
    }

    const { data, error } = await supabase.rpc(
      "fetch_messages_delegated_v1",
      {
        p_user_id: payload.sub,
        p_conversation_id: body.conversation_id,
        p_before_seq: body.before_seq ?? null,
        p_limit: body.limit ?? 50,
      },
    );

    if (error) {
      return json(500, { error: `Failed to fetch messages: ${error.message}` });
    }

    return json(200, { ok: true, messages: data ?? [] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Authorization")) return json(401, { error: "Unauthorized" });
    return json(500, { error: "Internal server error" });
  }
});
