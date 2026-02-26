/**
 * Phase 1 Trust-lite: Delegation Token Issuance
 * 
 * Edge Function that issues real JWT delegation tokens.
 * Replaces placeholder JWT from issue_delegation_token_v1() RPC.
 * 
 * Required secrets:
 * - SERVICE_KEY_ENCRYPTION_SECRET (for decrypting service keys)
 * - JWT_SIGNING_SECRET (for HS256 signing, if different from encryption secret)
 * 
 * Request body:
 * {
 *   "service_id": "string",
 *   "scopes": ["dm:create", "media:upload"],
 *   "expires_minutes": 60 (optional, default 60)
 * }
 * 
 * Response:
 * {
 *   "ok": true,
 *   "delegation_id": "uuid",
 *   "token": "eyJhbGciOiJIUzI1NiIs...",
 *   "expires_at": "2026-02-24T12:00:00Z"
 * }
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as jose from "https://deno.land/x/jose@v5.2.0/index.ts";
import { enforceCors, getCorsHeaders, handleCors } from "../_shared/utils.ts";

type RequestBody = {
  service_id: string;
  scopes: string[];
  expires_minutes?: number;
};

type IssueTokenResult = {
  delegation_id: string;
  token_jwt: string;
  token_payload: {
    sub: string;
    tenant_id: string;
    service_id: string;
    scopes: string[];
    exp: number;
    iat: number;
    jti: string;
  };
};

function json(status: number, body: unknown, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(origin), "Content-Type": "application/json" },
  });
}

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

async function verifyDbState(opts: {
  supabase: ReturnType<typeof createClient>;
  delegationId: string;
  jti: string;
  expectedTokenHash: string;
  prevJti?: string | null;
  prevDelegationId?: string | null;
}) {
  const { supabase, delegationId, jti, expectedTokenHash, prevJti, prevDelegationId } = opts;

  const { data: delegation, error: delegationError } = await supabase
    .from("delegations")
    .select("delegation_id")
    .eq("delegation_id", delegationId)
    .maybeSingle();

  const { data: tokenRow, error: tokenError } = await supabase
    .from("delegation_tokens")
    .select("jti, token_hash")
    .eq("jti", jti)
    .maybeSingle();

  const { data: prevTokenRow, error: prevTokenError } = prevJti
    ? await supabase
        .from("delegation_tokens")
        .select("jti, revoked_at")
        .eq("jti", prevJti)
        .maybeSingle()
    : { data: null, error: null };

  const { data: prevDelegationRow, error: prevDelegationError } = prevDelegationId
    ? await supabase
        .from("delegations")
        .select("delegation_id, revoked_at")
        .eq("delegation_id", prevDelegationId)
        .maybeSingle()
    : { data: null, error: null };

  const delegationOk = !delegationError && !!delegation?.delegation_id;
  const tokenOk = !tokenError && !!tokenRow?.jti;
  const tokenHashOk = tokenOk && tokenRow?.token_hash === expectedTokenHash;

  const prevTokenOk = prevJti ? !prevTokenError && !!prevTokenRow?.jti : true;
  const prevTokenRevokedOk = prevJti ? !!prevTokenRow?.revoked_at : true;
  const prevDelegationOk = prevDelegationId ? !prevDelegationError && !!prevDelegationRow?.delegation_id : true;
  const prevDelegationRevokedOk = prevDelegationId ? !!prevDelegationRow?.revoked_at : true;

  return {
    ok:
      delegationOk &&
      tokenOk &&
      tokenHashOk &&
      prevTokenOk &&
      prevTokenRevokedOk &&
      prevDelegationOk &&
      prevDelegationRevokedOk,
    delegation_ok: delegationOk,
    token_ok: tokenOk,
    token_hash_ok: tokenHashOk,
    prev_token_ok: prevJti ? prevTokenOk : undefined,
    prev_token_revoked_ok: prevJti ? prevTokenRevokedOk : undefined,
    prev_delegation_ok: prevDelegationId ? prevDelegationOk : undefined,
    prev_delegation_revoked_ok: prevDelegationId ? prevDelegationRevokedOk : undefined,
    errors: {
      delegation: delegationError?.message ?? null,
      token: tokenError?.message ?? null,
      prev_token: prevTokenError?.message ?? null,
      prev_delegation: prevDelegationError?.message ?? null,
    },
  };
}

async function getUserFromAuth(req: Request, supabaseUrl: string, anonKey: string) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Missing or invalid Authorization header");
  }

  const token = authHeader.slice(7);
  const supabase = createClient(supabaseUrl, anonKey);
  
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    throw new Error("Invalid or expired token");
  }

  return user;
}

serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const corsBlock = enforceCors(req);
  if (corsBlock) return corsBlock;
  const origin = req.headers.get("origin");

  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" }, origin);
  }

  try {
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = req.headers.get("apikey") || Deno.env.get("SUPABASE_ANON_KEY") || "";

    const issuerSecret = Deno.env.get("DELEGATION_ISSUER_SECRET");
    if (!issuerSecret) {
      return json(500, { error: "Server configuration error" }, origin);
    }
    const issuerHeader = req.headers.get("x-delegation-issuer");
    if (!issuerHeader || issuerHeader !== issuerSecret) {
      return json(403, { error: "Forbidden" }, origin);
    }

    // Authenticate user
    const user = await getUserFromAuth(req, supabaseUrl, anonKey);
    console.log(`[issue-delegation-token] User authenticated: ${user.id}`);

    // Parse request body
    const body = await req.json() as RequestBody;
    const { service_id, scopes, expires_minutes = 60 } = body;

    if (!service_id || !scopes || !Array.isArray(scopes) || scopes.length === 0) {
      return json(400, { error: "Missing or invalid service_id or scopes" }, origin);
    }

    // Create service-role Supabase client
    const supabase = createClient(supabaseUrl, serviceKey);

    const verifyDb = req.headers.get("x-debug-db-verify") === "1";
    const prevJti = req.headers.get("x-debug-prev-jti");
    const prevDelegationId = req.headers.get("x-debug-prev-delegation-id");

    // Resolve tenant_id for the authenticated user
    const { data: tenantId, error: tenantIdError } = await supabase.rpc<string | null>(
      "get_user_tenant_id_v1",
      { p_user_id: user.id },
    );

    if (tenantIdError) {
      console.error("[issue-delegation-token] get_user_tenant_id_v1 error:", tenantIdError);
      return json(500, { error: `Failed to resolve tenant_id: ${tenantIdError.message}` }, origin);
    }

    if (!tenantId) {
      return json(400, { error: "No tenant found for user" }, origin);
    }

    const { data: serviceIdentity, error: serviceIdentityError } = await supabase
      .from("service_identities")
      .select("service_id, status")
      .eq("tenant_id", tenantId)
      .eq("service_id", service_id)
      .maybeSingle();

    if (serviceIdentityError) {
      console.error("[issue-delegation-token] service_identities upsert error:", serviceIdentityError);
      return json(500, { error: `Failed to verify service identity: ${serviceIdentityError.message}` }, origin);
    }

    if (!serviceIdentity || serviceIdentity.status !== "active") {
      return json(403, { error: "Service identity not allowed" }, origin);
    }

    // Call RPC to create delegation record (returns placeholder JWT + payload)
    const { data, error } = await supabase.rpc<IssueTokenResult>("issue_delegation_token_v1", {
      p_auth_context: { user_id: user.id },
      p_service_id: service_id,
      p_scopes: scopes,
      p_expires_minutes: expires_minutes,
    });

    if (error) {
      console.error("[issue-delegation-token] RPC error:", error);
      
      // Handle specific error codes
      if (error.code === "P0019") {
        return json(401, { error: "Invalid auth context" }, origin);
      }
      if (error.code === "P0008") {
        return json(400, { error: "Invalid scopes (wildcards not allowed)" }, origin);
      }
      if (error.code === "42883") {
        return json(400, { error: "Scope validation failed" }, origin);
      }
      if (error.message?.includes("rate_limit_exceeded")) {
        return json(429, { error: "Rate limit exceeded" }, origin);
      }
      
      return json(500, { error: `Token issuance failed: ${error.message}` }, origin);
    }

    if (!data || data.length === 0) {
      return json(500, { error: "RPC returned no data" }, origin);
    }

    const result = data[0] as IssueTokenResult;
    const payload = result.token_payload;

    // Generate real JWT using HS256
    const jwtSecret = Deno.env.get("JWT_SIGNING_SECRET") || requireEnv("SERVICE_KEY_ENCRYPTION_SECRET");
    const jwtSecretKey = new TextEncoder().encode(jwtSecret);

    const jwt = await new jose.SignJWT({
      sub: payload.sub,
      tenant_id: payload.tenant_id,
      service_id: payload.service_id,
      scopes: payload.scopes,
      jti: payload.jti,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuedAt(payload.iat)
      .setExpirationTime(payload.exp)
      .sign(jwtSecretKey);

    console.log(`[issue-delegation-token] JWT signed for delegation: ${result.delegation_id}`);

    // Verify signature server-side (so clients/tests can rely on a boolean without sharing secrets)
    let signatureOk = false;
    try {
      await jose.jwtVerify(jwt, jwtSecretKey, {
        algorithms: ["HS256"],
        typ: "JWT",
      });
      signatureOk = true;
    } catch (verifyError) {
      console.error("[issue-delegation-token] JWT verification failed:", verifyError);
      return json(500, { error: "JWT signing verification failed" }, origin);
    }

    // Update delegation_tokens table with real JWT hash
    const tokenHash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(jwt)
    );
    const tokenHashHex = Array.from(new Uint8Array(tokenHash))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");

    const { error: updateError } = await supabase
      .from("delegation_tokens")
      .update({ token_hash: tokenHashHex })
      .eq("jti", payload.jti);

    if (updateError) {
      console.error("[issue-delegation-token] Failed to update token_hash:", updateError);
      // Non-critical error, continue
    }

    const dbVerification = verifyDb
      ? await verifyDbState({
          supabase,
          delegationId: result.delegation_id,
          jti: payload.jti,
          expectedTokenHash: tokenHashHex,
          prevJti,
          prevDelegationId,
        })
      : null;

    if (verifyDb && dbVerification && !dbVerification.ok) {
      console.error("[issue-delegation-token] DB verification failed:", dbVerification);
      return json(500, { error: "DB verification failed" }, origin);
    }

    return json(200, {
      ok: true,
      delegation_id: result.delegation_id,
      token: jwt,
      expires_at: new Date(payload.exp * 1000).toISOString(),
      signature_ok: signatureOk,
      alg: "HS256",
      db_verified: verifyDb ? true : undefined,
      db: verifyDb ? dbVerification : undefined,
    }, origin);

  } catch (error) {
    console.error("[issue-delegation-token] Error:", error);
    
    if (error instanceof Error) {
      if (error.message.includes("not configured")) {
        return json(500, { error: "Server configuration error" }, origin);
      }
      if (error.message.includes("Authorization")) {
        return json(401, { error: "Unauthorized" }, origin);
      }
    }
    
    const debug = Deno.env.get("DEBUG_ERRORS") === "1";
    if (debug) {
      const message = error instanceof Error ? error.message : String(error);
      return json(500, { error: "Internal server error", message }, origin);
    }

    return json(500, { error: "Internal server error" }, origin);
  }
});
