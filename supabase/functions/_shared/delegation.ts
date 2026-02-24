import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as jose from "https://deno.land/x/jose@v5.2.0/index.ts";

export type DelegationJwtPayload = {
  sub: string;
  tenant_id: string;
  service_id: string;
  scopes: string[];
  jti: string;
  iat: number;
  exp: number;
};

export function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export function getBearer(req: Request): string {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Missing or invalid Authorization header");
  }
  return authHeader.slice(7);
}

export function hasScope(scopes: unknown, needed: string): boolean {
  if (!Array.isArray(scopes)) return false;
  return scopes.includes(needed);
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyDelegationJwtHs256(token: string): Promise<{ payload: DelegationJwtPayload; alg: string }>{
  const jwtSecret = Deno.env.get("JWT_SIGNING_SECRET") || requireEnv("SERVICE_KEY_ENCRYPTION_SECRET");
  const jwtSecretKey = new TextEncoder().encode(jwtSecret);

  const { payload, protectedHeader } = await jose.jwtVerify(token, jwtSecretKey, {
    algorithms: ["HS256"],
    typ: "JWT",
  });

  const sub = payload.sub;
  const tenantId = (payload as any).tenant_id;
  const serviceId = (payload as any).service_id;
  const scopes = (payload as any).scopes;
  const jti = (payload as any).jti;
  const iat = (payload as any).iat;
  const exp = (payload as any).exp;

  if (
    typeof sub !== "string" ||
    typeof tenantId !== "string" ||
    typeof serviceId !== "string" ||
    typeof jti !== "string" ||
    !Array.isArray(scopes) ||
    typeof iat !== "number" ||
    typeof exp !== "number"
  ) {
    throw new Error("Invalid token payload");
  }

  return {
    payload: {
      sub,
      tenant_id: tenantId,
      service_id: serviceId,
      scopes,
      jti,
      iat,
      exp,
    },
    alg: String(protectedHeader.alg || ""),
  };
}

export async function validateDelegationInDb(opts: {
  supabase: ReturnType<typeof createClient>;
  token: string;
  payload: DelegationJwtPayload;
}): Promise<{ delegation_id: string }>{
  const { supabase, token, payload } = opts;

  const tokenHash = await sha256Hex(token);

  const { data: tokenRow, error: tokenError } = await supabase
    .from("delegation_tokens")
    .select("delegation_id, token_hash, revoked_at, expires_at")
    .eq("jti", payload.jti)
    .maybeSingle();

  if (tokenError || !tokenRow) throw new Error("Unknown token");
  if (tokenRow.revoked_at) throw new Error("Token revoked");
  if (tokenRow.expires_at && new Date(tokenRow.expires_at).getTime() <= Date.now()) throw new Error("Token expired");
  if (tokenRow.token_hash !== tokenHash) throw new Error("Token hash mismatch");

  const { data: delegationRow, error: delegationError } = await supabase
    .from("delegations")
    .select("tenant_id, user_id, service_id, revoked_at, expires_at")
    .eq("delegation_id", tokenRow.delegation_id)
    .maybeSingle();

  if (delegationError || !delegationRow) throw new Error("Delegation not found");
  if (delegationRow.revoked_at) throw new Error("Delegation revoked");
  if (delegationRow.expires_at && new Date(delegationRow.expires_at).getTime() <= Date.now()) throw new Error("Delegation expired");

  if (
    delegationRow.tenant_id !== payload.tenant_id ||
    delegationRow.user_id !== payload.sub ||
    delegationRow.service_id !== payload.service_id
  ) {
    throw new Error("Delegation claims mismatch");
  }

  return { delegation_id: String(tokenRow.delegation_id) };
}
