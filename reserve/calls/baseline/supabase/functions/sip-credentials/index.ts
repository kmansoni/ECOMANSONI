import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * SIP Credentials Edge Function
 * Returns SIP credentials for external SIP provider integration
 * 
 * Required secrets:
 * - SIP_WSS_URL: WebSocket URL (wss://...)
 * - SIP_DOMAIN: SIP domain
 * - SIP_USERNAME: SIP username  
 * - SIP_PASSWORD: SIP password
 */
serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const wssUrl = Deno.env.get("SIP_WSS_URL");
    const domain = Deno.env.get("SIP_DOMAIN");
    const username = Deno.env.get("SIP_USERNAME");
    const password = Deno.env.get("SIP_PASSWORD");

    // Check if SIP is configured
    if (!wssUrl || !domain || !username || !password) {
      console.log("[SIP] SIP provider not configured");
      return new Response(
        JSON.stringify({ 
          configured: false,
          message: "SIP provider not configured"
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    console.log("[SIP] Returning SIP credentials for domain:", domain);

    return new Response(
      JSON.stringify({
        configured: true,
        wssUrl,
        domain,
        username,
        // Note: In production, you might want to use token-based auth
        // instead of returning the password directly
        password,
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  } catch (error: unknown) {
    console.error("[SIP] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    return new Response(
      JSON.stringify({ 
        configured: false,
        error: errorMessage 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
