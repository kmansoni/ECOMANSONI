// @ts-nocheck
// Deno Edge Function: internal endpoint to start + (optionally) execute a trends run.

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

type TrendsRunRequest = {
  segment_id?: string;
  window?: "1h" | "6h" | "24h";
  candidate_limit?: number;
  algorithm_version?: string;
  idempotency_key?: string;
  mode?: "sync" | "enqueue";
};

serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const expectedToken = Deno.env.get("TRENDS_WORKER_TOKEN") || Deno.env.get("INTERNAL_WORKER_TOKEN");
  if (expectedToken) {
    const token = getBearerToken(req);
    if (!token) return json(401, { error: "Missing Authorization bearer token" });
    if (token !== expectedToken) return json(403, { error: "Forbidden" });
  }

  let body: TrendsRunRequest = {};
  try {
    body = (await req.json()) as TrendsRunRequest;
  } catch {
    body = {};
  }

  const supabaseUrl = requireEnv("SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceKey);

  const segmentId = (body.segment_id || "seg_default").slice(0, 64);
  const windowKey = body.window || "24h";
  const candidateLimit = Math.max(1, Math.min(500, body.candidate_limit ?? 50));
  const algorithmVersion = (body.algorithm_version || "trending-v1").slice(0, 64);

  const headerIdem = req.headers.get("x-idempotency-key") || req.headers.get("X-Idempotency-Key");
  const idempotencyKey = (body.idempotency_key || headerIdem || null)?.toString() || null;

  const mode = body.mode || "sync";

  const started = await supabase.rpc("start_trend_run_v1", {
    p_segment_id: segmentId,
    p_window: windowKey,
    p_candidate_limit: candidateLimit,
    p_algorithm_version: algorithmVersion,
    p_idempotency_key: idempotencyKey,
  });

  if (started.error) {
    return json(500, { ok: false, step: "start", error: started.error });
  }

  const startedRow = Array.isArray(started.data) ? started.data[0] : started.data;
  if (!startedRow?.run_id) {
    return json(500, { ok: false, step: "start", error: { message: "Missing run_id" } });
  }

  if (mode === "enqueue") {
    return json(200, {
      ok: true,
      mode,
      run: startedRow,
    });
  }

  const executed = await supabase.rpc("execute_trend_run_v1", {
    p_run_id: startedRow.run_id,
  });

  if (executed.error) {
    return json(500, { ok: false, step: "execute", run: startedRow, error: executed.error });
  }

  const executedRow = Array.isArray(executed.data) ? executed.data[0] : executed.data;

  return json(200, {
    ok: true,
    mode,
    run: {
      run_id: executedRow?.run_id ?? startedRow.run_id,
      window: executedRow?.window ?? startedRow.window,
      started_at: executedRow?.started_at ?? startedRow.started_at,
      ended_at: executedRow?.ended_at ?? null,
      status: executedRow?.status ?? "succeeded",
      inputs: startedRow.inputs ?? null,
      outputs: executedRow?.outputs ?? startedRow.outputs ?? null,
      reason_codes: startedRow.reason_codes ?? [],
      notes: startedRow.notes ?? null,
    },
  });
});
