/**
 * A4: Health Check Endpoint
 * 
 * Simple health check for monitoring and load balancers.
 * Returns status of the edge function runtime.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  version: string;
  checks: {
    database: "ok" | "error";
    storage: "ok" | "error";
  };
  latency?: {
    database_ms: number;
  };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = performance.now();
  
  const health: HealthStatus = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    checks: {
      database: "ok",
      storage: "ok",
    },
  };

  try {
    // Create Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check database connectivity
    const dbStart = performance.now();
    const { error: dbError } = await supabase
      .from("profiles")
      .select("id")
      .limit(1);
    
    const dbLatency = performance.now() - dbStart;
    health.latency = { database_ms: Math.round(dbLatency) };

    if (dbError) {
      health.checks.database = "error";
      health.status = "degraded";
      console.error("Database check failed:", dbError);
    }

    // Check storage (list buckets)
    const { error: storageError } = await supabase
      .storage
      .listBuckets();

    if (storageError) {
      health.checks.storage = "error";
      health.status = "degraded";
      console.error("Storage check failed:", storageError);
    }

    // Determine overall status
    if (health.checks.database === "error" && health.checks.storage === "error") {
      health.status = "unhealthy";
    }

    const statusCode = health.status === "healthy" ? 200 : 
                       health.status === "degraded" ? 200 : 503;

    return new Response(JSON.stringify(health, null, 2), {
      status: statusCode,
      headers: { 
        ...corsHeaders, 
        "Content-Type": "application/json",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });

  } catch (error) {
    console.error("Health check error:", error);
    
    health.status = "unhealthy";
    health.checks.database = "error";
    health.checks.storage = "error";

    return new Response(JSON.stringify(health, null, 2), {
      status: 503,
      headers: { 
        ...corsHeaders, 
        "Content-Type": "application/json",
      },
    });
  }
});
