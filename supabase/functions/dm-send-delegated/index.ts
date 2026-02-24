/**
 * Phase 1 Trust-lite: Delegation token consumer for dm:create
 *
 * Accepts a delegation JWT (Authorization: Bearer <token>) and sends a DM message
 * as the delegated user to a target user.
 *
 * Required secrets:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 * - SERVICE_KEY_ENCRYPTION_SECRET (fallback signing secret)
 * Optional:
 * - JWT_SIGNING_SECRET (preferred signing secret)
 *
 * Request body:
 * {
 *   "target_user_id": "uuid",
 *   "body": "text or JSON envelope",
 *   "client_msg_id": "uuid" (optional)
 * }
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getBearer,
  hasScope,
  requireEnv,
  sha256Hex,
  validateDelegationInDb,
  verifyDelegationJwtHs256,
} from "../_shared/delegation.ts";
import { enforceRateLimit } from "../_shared/trust-lite.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-debug-db-verify",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RequestBody = {
  target_user_id: string;
  body: string;
  client_msg_id?: string;
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

    const sub = payload.sub;
    const tenantId = payload.tenant_id;
    const serviceId = payload.service_id;
    const scopes = payload.scopes;

    if (!hasScope(scopes, "dm:create")) {
      return json(403, { error: "Missing scope: dm:create" });
    }

    const body = (await req.json()) as RequestBody;
    const { target_user_id, body: messageBody, client_msg_id } = body;

    if (!target_user_id || !messageBody || typeof messageBody !== "string") {
      return json(400, { error: "Missing target_user_id or body" });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Phase 1 EPIC L: trust-lite + rate limiting (DB-backed)
    // Action mapping: dm:create consumer => send_message
    const rateRequestId = await sha256Hex(`${sub}:${tenantId}:${serviceId}:${Date.now()}`);
    const rl = await enforceRateLimit(supabase, {
      actorType: "user",
      actorId: sub,
      action: "send_message",
      requestId: rateRequestId,
      context: {
        tenant_id: tenantId,
        service_id: serviceId,
        endpoint: "dm-send-delegated",
      },
    });
    if (!rl.allowed) {
      return new Response(
        JSON.stringify({
          error: "Too many requests",
          action: "send_message",
          tier: rl.tier,
          retryAfter: rl.retry_after_seconds,
        }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Retry-After": String(rl.retry_after_seconds),
          },
        },
      );
    }

    // Validate token is active + not revoked (DB source of truth)
    try {
      await validateDelegationInDb({ supabase, token, payload });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return json(401, { error: msg });
    }

    // Perform action: create/get DM + send message as delegated user
    const { data: convId, error: convError } = await supabase.rpc<string>("get_or_create_dm_delegated_v1", {
      p_user_id: sub,
      target_user_id,
    });

    if (convError || !convId) {
      return json(500, { error: `Failed to create/get DM: ${convError?.message || "unknown"}` });
    }

    const effectiveClientMsgId = client_msg_id || crypto.randomUUID();

    const { data: sendData, error: sendError } = await supabase.rpc<{ message_id: string; seq: number }>(
      "send_message_delegated_v1",
      {
        p_user_id: sub,
        conversation_id: convId,
        client_msg_id: effectiveClientMsgId,
        body: messageBody,
      },
    );

    if (sendError || !sendData || sendData.length === 0) {
      return json(500, { error: `Failed to send message: ${sendError?.message || "unknown"}` });
    }

    const sent = sendData[0];

    const verifyDb = req.headers.get("x-debug-db-verify") === "1";
    if (verifyDb) {
      const { data: msgRow, error: msgErr } = await supabase
        .from("messages")
        .select("id, sender_id, conversation_id")
        .eq("id", sent.message_id)
        .maybeSingle();

      if (msgErr || !msgRow || msgRow.sender_id !== sub || msgRow.conversation_id !== convId) {
        return json(500, { error: "DB verification failed" });
      }
    }

    return json(200, {
      ok: true,
      conversation_id: convId,
      message_id: sent.message_id,
      seq: sent.seq,
      db_verified: verifyDb ? true : undefined,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Authorization")) return json(401, { error: "Unauthorized" });
    return json(500, { error: "Internal server error" });
  }
});
