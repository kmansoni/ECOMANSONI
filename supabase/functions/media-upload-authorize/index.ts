/**
 * Phase 1 Trust-lite: Delegation token consumer for media:upload
 *
 * Accepts a delegation JWT (Authorization: Bearer <token>) and returns a signed
 * upload URL for Supabase Storage.
 *
 * This is the minimal safe primitive for allowing external services (using
 * delegation tokens) to upload media without needing Supabase Auth sessions.
 *
 * Required secrets:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 * - SERVICE_KEY_ENCRYPTION_SECRET (fallback signing secret)
 * Optional:
 * - JWT_SIGNING_SECRET (preferred signing secret)
 *
 * Request body (optional):
 * {
 *   "extension": "jpg" | "png" | "webm" | ... (optional)
 *   "content_type": "image/jpeg" | ... (optional)
 * }
 *
 * Response:
 * {
 *   ok: true,
 *   bucket: "chat-media",
 *   path: "<object path>",
 *   signed_url: "https://...",
 *   token: "<upload token>",
 *   public_url: "https://.../storage/v1/object/public/..."
 * }
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
import { enforceRateLimit } from "../_shared/trust-lite.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RequestBody = {
  extension?: string;
  content_type?: string;
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeExtension(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const raw = input.trim().toLowerCase().replace(/^\.+/, "");
  if (!raw) return null;
  if (raw.length > 16) return null;
  if (!/^[a-z0-9]+$/.test(raw)) return null;
  return raw;
}

function extensionFromContentType(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const ct = input.trim().toLowerCase();
  if (!ct) return null;
  if (ct.startsWith("image/")) return ct.endsWith("png") ? "png" : ct.endsWith("webp") ? "webp" : "jpg";
  if (ct === "video/webm") return "webm";
  if (ct === "video/mp4") return "mp4";
  if (ct === "audio/ogg") return "ogg";
  if (ct === "audio/mp4") return "m4a";
  return null;
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

    if (!hasScope(payload.scopes, "media:upload")) {
      return json(403, { error: "Missing scope: media:upload" });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Phase 1 EPIC L: trust-lite + rate limiting (DB-backed)
    const rl = await enforceRateLimit(supabase, {
      actorType: "user",
      actorId: payload.sub,
      action: "media_upload",
      requestId: crypto.randomUUID(),
      context: {
        tenant_id: payload.tenant_id,
        service_id: payload.service_id,
        endpoint: "media-upload-authorize",
      },
    });
    if (!rl.allowed) {
      return new Response(
        JSON.stringify({
          error: "Too many requests",
          action: "media_upload",
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

    try {
      await validateDelegationInDb({ supabase, token, payload });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return json(401, { error: msg });
    }

    const body: RequestBody = await req.json().catch(() => ({} as RequestBody));
    const ext = normalizeExtension(body.extension) || extensionFromContentType(body.content_type) || "bin";

    const bucket = "chat-media";
    const objectPath = `${payload.sub}/delegated/${crypto.randomUUID()}.${ext}`;

    const { data, error: signError } = await supabase.storage.from(bucket).createSignedUploadUrl(objectPath);
    if (signError || !data?.signedUrl) {
      return json(500, { error: `Failed to sign upload url: ${signError?.message || "unknown"}` });
    }

    const signedPath = data.path || objectPath;
    const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(signedPath);

    return json(200, {
      ok: true,
      bucket,
      path: signedPath,
      signed_url: data.signedUrl,
      token: data.token,
      public_url: publicUrlData?.publicUrl,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Authorization")) return json(401, { error: "Unauthorized" });
    return json(500, { error: "Internal server error" });
  }
});
