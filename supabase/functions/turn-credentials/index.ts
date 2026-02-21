import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function parseUrls(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[\s,]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

function base64FromArrayBuffer(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function hmacSha1Base64(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return base64FromArrayBuffer(sig);
}

function splitIceServersByUrl(server: { urls: string | string[]; username?: string; credential?: string }) {
  const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
  const out: Array<{ urls: string; username?: string; credential?: string }> = [];
  for (const u of urls) {
    if (typeof u !== "string" || !u) continue;
    if (u.startsWith("stun:")) out.push({ urls: u });
    else out.push({ urls: u, username: server.username, credential: server.credential });
  }
  return out;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Provider priority:
    // 1) Self-host / any TURN provider via TURN_URLS + (TURN_SHARED_SECRET or TURN_USERNAME+TURN_CREDENTIAL)
    // 2) Cloudflare Calls TURN via CLOUDFLARE_TURN_* (legacy)
    // 3) STUN-only fallback

    const ttlSeconds = Math.max(60, Number(Deno.env.get("TURN_TTL_SECONDS") ?? "3600"));
    const turnUrls = parseUrls(Deno.env.get("TURN_URLS"));
    const turnSharedSecret = Deno.env.get("TURN_SHARED_SECRET");
    const turnUsername = Deno.env.get("TURN_USERNAME");
    const turnCredential = Deno.env.get("TURN_CREDENTIAL");

    if (turnUrls.length > 0) {
      console.log("[TURN] Using TURN_URLS from secrets (provider-agnostic)");

      if (turnSharedSecret) {
        // coturn REST auth: username is expiry timestamp
        const expiry = Math.floor(Date.now() / 1000) + ttlSeconds;
        const authUser = `${expiry}`;
        const authPass = await hmacSha1Base64(turnSharedSecret, authUser);

        const iceServers = [
          { urls: "stun:stun.l.google.com:19302" },
          ...splitIceServersByUrl({ urls: turnUrls, username: authUser, credential: authPass }),
        ];

        return new Response(JSON.stringify({ iceServers }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (turnUsername && turnCredential) {
        const iceServers = [
          { urls: "stun:stun.l.google.com:19302" },
          ...splitIceServersByUrl({ urls: turnUrls, username: turnUsername, credential: turnCredential }),
        ];

        return new Response(JSON.stringify({ iceServers }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.warn("[TURN] TURN_URLS set but missing TURN_SHARED_SECRET or TURN_USERNAME/TURN_CREDENTIAL");
      return new Response(
        JSON.stringify({
          error: "TURN_URLS is set but credentials are missing",
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
          ],
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const turnKeyId = Deno.env.get("CLOUDFLARE_TURN_KEY_ID");
    const turnApiToken = Deno.env.get("CLOUDFLARE_TURN_API_TOKEN");

    if (!turnKeyId || !turnApiToken) {
      console.error(
        "[TURN] Missing TURN config. Set TURN_URLS + TURN_SHARED_SECRET (or TURN_USERNAME/TURN_CREDENTIAL), or CLOUDFLARE_TURN_KEY_ID + CLOUDFLARE_TURN_API_TOKEN"
      );
      return new Response(
        JSON.stringify({
          error: "TURN credentials not configured",
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
          ],
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[TURN] Fetching credentials from Cloudflare...");
    console.log("[TURN] Key ID:", turnKeyId.substring(0, 8) + "...");

    // CORRECT endpoint for Cloudflare TURN
    // Documentation: https://developers.cloudflare.com/calls/turn/generate-credentials/
    const url = `https://rtc.live.cloudflare.com/v1/turn/keys/${turnKeyId}/credentials/generate`;
    
    console.log("[TURN] Request URL:", url);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${turnApiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ 
        ttl: 86400 // 24 hours
      }),
    });

    console.log("[TURN] Response status:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[TURN] Cloudflare error:", response.status, errorText);
      
      // Return fallback STUN servers on error
      return new Response(
        JSON.stringify({ 
          error: `Cloudflare TURN error: ${response.status}`,
          errorDetails: errorText,
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
          ]
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    
    // Log full response for debugging
    console.log("[TURN] Full Cloudflare response:", JSON.stringify(data, null, 2));

    // Cloudflare response format:
    // { iceServers: { urls: [...], username: "...", credential: "..." } }
    // 
    // IMPORTANT: Safari/iOS WebRTC requires SEPARATE ICE server objects per URL
    const iceServers: Array<{ urls: string; username?: string; credential?: string }> = [];
    
    if (data.iceServers) {
      const servers = Array.isArray(data.iceServers) ? data.iceServers : [data.iceServers];
      for (const s of servers) {
        if (!s?.urls) continue;
        iceServers.push(...splitIceServersByUrl({ urls: s.urls, username: s.username, credential: s.credential }));
      }
    }

    // Ensure we have a STUN server (add Google STUN as backup if needed)
    const hasStun = iceServers.some(s => s.urls.startsWith('stun:'));
    if (!hasStun) {
      console.log("[TURN] No STUN in response, adding Google STUN");
      iceServers.unshift({ urls: "stun:stun.l.google.com:19302" });
    }

    // Log what we're returning
    console.log("[TURN] Returning", iceServers.length, "ICE servers (split by URL):");
    iceServers.forEach((s, i) => {
      console.log(`[TURN] Server ${i}: ${s.urls}${s.username ? ' (with auth)' : ''}`);
    });

    return new Response(
      JSON.stringify({ iceServers }),
      { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  } catch (error: unknown) {
    console.error("[TURN] Exception:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    // Return fallback on exception
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ]
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
