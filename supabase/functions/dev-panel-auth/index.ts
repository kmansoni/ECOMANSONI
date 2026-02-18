import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { login, password } = await req.json();
    
    const DEV_LOGIN = Deno.env.get("DEV_PANEL_LOGIN");
    const DEV_PASSWORD = Deno.env.get("DEV_PANEL_PASSWORD");
    
    if (!DEV_LOGIN || !DEV_PASSWORD) {
      return new Response(
        JSON.stringify({ success: false, error: "Dev panel not configured" }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (login === DEV_LOGIN && password === DEV_PASSWORD) {
      // Generate a simple session token (valid for 24h)
      const token = btoa(JSON.stringify({
        login,
        exp: Date.now() + 24 * 60 * 60 * 1000,
        sig: btoa(DEV_PASSWORD.slice(0, 4) + Date.now().toString())
      }));
      
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
