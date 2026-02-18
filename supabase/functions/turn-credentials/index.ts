import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const turnKeyId = Deno.env.get("CLOUDFLARE_TURN_KEY_ID");
    const turnApiToken = Deno.env.get("CLOUDFLARE_TURN_API_TOKEN");

    if (!turnKeyId || !turnApiToken) {
      console.error("[TURN] Missing credentials - CLOUDFLARE_TURN_KEY_ID or CLOUDFLARE_TURN_API_TOKEN not set");
      return new Response(
        JSON.stringify({ 
          error: "TURN credentials not configured",
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
          ]
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
    // We must split the urls array into individual server entries
    
    const iceServers: Array<{ urls: string; username?: string; credential?: string }> = [];
    
    const processServer = (server: any) => {
      const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
      const username = server.username;
      const credential = server.credential;
      
      for (const singleUrl of urls) {
        if (typeof singleUrl === 'string') {
          // STUN servers don't need auth, TURN servers do
          if (singleUrl.startsWith('stun:')) {
            iceServers.push({ urls: singleUrl });
          } else {
            // TURN/TURNS - include credentials
            iceServers.push({
              urls: singleUrl,
              username,
              credential,
            });
          }
        }
      }
    };
    
    if (data.iceServers) {
      if (Array.isArray(data.iceServers)) {
        for (const server of data.iceServers) {
          processServer(server);
        }
      } else if (typeof data.iceServers === 'object') {
        processServer(data.iceServers);
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
