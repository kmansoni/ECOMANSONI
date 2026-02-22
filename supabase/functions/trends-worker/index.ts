// @ts-nocheck
// Deno Edge Function: internal worker to process trend runs.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function getBearerToken(req: Request): string | null {
  const auth = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!auth) return null;
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || null;
}

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

type WorkerRequest = {
  max_runs?: number;
  lease_seconds?: number;
  worker_id?: string;
  dry_run?: boolean;
};

serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const expectedToken = Deno.env.get("TRENDS_WORKER_TOKEN") || Deno.env.get("INTERNAL_WORKER_TOKEN");
  if (expectedToken) {
    const token = getBearerToken(req);
    if (!token) return json(401, { error: "Missing Authorization bearer token" });
    if (token !== expectedToken) return json(403, { error: "Forbidden" });
  }

  let body: WorkerRequest = {};
  try {
    body = (await req.json()) as WorkerRequest;
  } catch {
    body = {};
  }

  const supabaseUrl = requireEnv("SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceKey);

  const workerId = (body.worker_id || Deno.env.get("DENO_REGION") || "trends-worker").slice(0, 80);
  const maxRuns = Math.max(1, Math.min(50, body.max_runs ?? 5));
  const leaseSeconds = Math.max(10, Math.min(600, body.lease_seconds ?? 90));
  const dryRun = Boolean(body.dry_run);

  const claimed = await supabase.rpc("claim_trend_runs_v1", {
    p_limit: maxRuns,
    p_worker_id: workerId,
    p_lease_seconds: leaseSeconds,
  });

  if (claimed.error) {
    return json(500, { ok: false, step: "claim", error: claimed.error });
  }

  const runs = (claimed.data || []) as Array<{ run_id: string; segment_id: string; window: string; started_at: string }>;

  const results: Array<{
    run_id: string;
    ok: boolean;
    status?: string;
    error?: unknown;
  }> = [];

  for (const r of runs) {
    if (dryRun) {
      results.push({ run_id: r.run_id, ok: true, status: "dry_run" });
      continue;
    }

    const exec = await supabase.rpc("execute_trend_run_v1", { p_run_id: r.run_id });
    if (exec.error) {
      // Best-effort fail mark; do not throw.
      await supabase
        .from("trend_runs")
        .update({
          status: "failed",
          ended_at: new Date().toISOString(),
          claimed_by: null,
          claimed_at: null,
          claim_expires_at: null,
          updated_at: new Date().toISOString(),
          reason_codes: ["svc.trends_worker_failed"],
          notes: `${exec.error.code ?? "ERR"}: ${exec.error.message ?? "execute failed"}`.slice(0, 500),
        })
        .eq("run_id", r.run_id);

      results.push({ run_id: r.run_id, ok: false, error: exec.error });
      continue;
    }

    const row = Array.isArray(exec.data) ? exec.data[0] : exec.data;
    results.push({ run_id: r.run_id, ok: true, status: row?.status || "succeeded" });
  }

  return json(200, {
    ok: true,
    worker_id: workerId,
    claimed: runs.length,
    processed: results.length,
    results,
  });
});
