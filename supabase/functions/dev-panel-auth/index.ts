import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { enforceCors, getCorsHeaders, isProductionEnv, handleCors } from "../_shared/utils.ts";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const corsBlock = enforceCors(req);
  if (corsBlock) return corsBlock;
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (isProductionEnv()) {
    return new Response("not found", { status: 404, headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const token = typeof body?.token === "string" ? body.token : null;
    const login = typeof body?.login === "string" ? body.login : "";
    const password = typeof body?.password === "string" ? body.password : "";
    
    const DEV_LOGIN = Deno.env.get("DEV_PANEL_LOGIN");
    const DEV_PASSWORD = Deno.env.get("DEV_PANEL_PASSWORD");
    const DEV_SECRET = Deno.env.get("DEV_PANEL_SECRET") ?? DEV_PASSWORD;
    
    if (!DEV_LOGIN || !DEV_PASSWORD || !DEV_SECRET) {
      return new Response(
        JSON.stringify({ success: false, error: "Dev panel not configured" }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const enc = new TextEncoder();
    const b64url = (bytes: Uint8Array) =>
      btoa(String.fromCharCode(...bytes))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
    const fromB64url = (s: string) => {
      const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
      const bin = atob(padded);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    };

    const sign = async (payloadB64: string) => {
      const key = await crypto.subtle.importKey(
        "raw",
        enc.encode(DEV_SECRET),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payloadB64));
      return b64url(new Uint8Array(sig));
    };

    const verify = async (token: string) => {
      const parts = token.split(".");
      if (parts.length !== 2) return { ok: false as const, error: "bad_token" };
      const [payloadB64, sigB64] = parts;
      const expected = await sign(payloadB64);
      if (expected !== sigB64) return { ok: false as const, error: "bad_sig" };
      let payload: any;
      try {
        payload = JSON.parse(new TextDecoder().decode(fromB64url(payloadB64)));
      } catch {
        return { ok: false as const, error: "bad_payload" };
      }
      if (!payload?.exp || typeof payload.exp !== "number") return { ok: false as const, error: "bad_exp" };
      if (payload.exp <= Date.now()) return { ok: false as const, error: "expired" };
      if (payload?.login !== DEV_LOGIN) return { ok: false as const, error: "bad_login" };
      return { ok: true as const, payload };
    };

    // Token verification mode
    if (token) {
      const res = await verify(token);
      return new Response(
        JSON.stringify({ success: res.ok }),
        { status: res.ok ? 200 : 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (login === DEV_LOGIN && password === DEV_PASSWORD) {
      // Signed token (valid for 24h)
      const payload = {
        login,
        exp: Date.now() + 24 * 60 * 60 * 1000,
      };
      const payloadB64 = b64url(enc.encode(JSON.stringify(payload)));
      const sigB64 = await sign(payloadB64);
      const token = `${payloadB64}.${sigB64}`;
      
      return new Response(
        JSON.stringify({ success: true, token }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    return new Response(
      JSON.stringify({ success: false, error: "Invalid credentials" }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
