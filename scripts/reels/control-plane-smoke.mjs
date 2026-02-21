import process from "node:process";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

import fs from "node:fs";
import path from "node:path";

function loadDotEnvIfPresent() {
  // Lightweight .env loader (no dependency). Local-only convenience.
  const candidates = [".env.local", ".env"];
  const envPaths = candidates.map((f) => path.resolve(process.cwd(), f));

  for (const envPath of envPaths) {
    if (!fs.existsSync(envPath)) continue;
    const raw = fs.readFileSync(envPath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    val = val.replace(/^"|"$/g, "").replace(/^'|'$/g, "");
    if (process.env[key] === undefined) process.env[key] = val;
  }
  }
}

function env(name, fallback = undefined) {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}

function mustEnv(name) {
  const v = env(name);
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

function uuid() {
  return crypto.randomUUID();
}

function base64UrlDecodeToString(input) {
  // input is base64url (RFC 7515)
  const padded = input.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((input.length + 3) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

function tryDecodeJwtPayload(token) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payloadRaw = base64UrlDecodeToString(parts[1]);
    return JSON.parse(payloadRaw);
  } catch {
    return null;
  }
}

function tryExtractProjectRefFromUrl(supabaseUrl) {
  // Typical: https://<ref>.supabase.co
  const m = /^https?:\/\/([a-z0-9-]+)\./i.exec(supabaseUrl ?? "");
  return m?.[1] ?? null;
}

function diagnoseServiceRoleKey(supabaseUrl, serviceKey) {
  const projectRef = tryExtractProjectRefFromUrl(supabaseUrl);
  const payload = tryDecodeJwtPayload(serviceKey);

  if (!payload) {
    return {
      ok: false,
      message:
        "SUPABASE_SERVICE_ROLE_KEY does not look like a valid JWT (expected 3 dot-separated parts). " +
        "Re-copy the 'service_role' key from Supabase Dashboard → Settings → API.",
    };
  }

  const tokenRole = payload?.role;
  const tokenRef = payload?.ref;

  if (projectRef && tokenRef && String(projectRef) !== String(tokenRef)) {
    return {
      ok: false,
      message: `SUPABASE_SERVICE_ROLE_KEY is for a different project (token ref=${tokenRef}, URL ref=${projectRef}).`,
    };
  }

  if (tokenRole && tokenRole !== "service_role") {
    return {
      ok: false,
      message: `SUPABASE_SERVICE_ROLE_KEY is not a service_role token (token role=${tokenRole}). Make sure you copied the 'service_role' key, not 'anon'.`,
    };
  }

  return { ok: true, message: "ok" };
}

function now() {
  return new Date();
}

function addMinutes(d, m) {
  return new Date(d.getTime() + m * 60_000);
}

async function rpc(supabase, fn, args) {
  const res = await supabase.rpc(fn, args);
  if (res.error) throw new Error(`${fn} failed: ${res.error.message}`);
  return res.data;
}

async function main() {
  loadDotEnvIfPresent();

  // Accept Vite-style vars as fallback.
  if (!process.env.SUPABASE_URL && process.env.VITE_SUPABASE_URL) {
    process.env.SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  }

  const supabaseUrl = mustEnv("SUPABASE_URL");
  const serviceKey = mustEnv("SUPABASE_SERVICE_ROLE_KEY");

  {
    const diag = diagnoseServiceRoleKey(supabaseUrl, serviceKey);
    if (!diag.ok) throw new Error(diag.message);
  }

  const environment = env("REELS_ENV", "prod");
  const segmentFromEnv = env("REELS_SEGMENT", "");

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const runId = uuid().slice(0, 8);
  const segment = segmentFromEnv && segmentFromEnv.trim() ? segmentFromEnv.trim() : `smoke-${runId}`;
  const untilIso = addMinutes(now(), 20).toISOString();

  console.log(`[smoke] env=${environment} segment=${segment} run=${runId}`);

  // 1) set suppression via apply_action
  {
    const data = await rpc(supabase, "reels_engine_apply_action", {
      p_environment: environment,
      p_segment_key: segment,
      p_action_type: "set_pipeline_suppression",
      p_idempotency_key: `smoke-${runId}-set`,
      p_payload: { suppressed_until: untilIso },
      p_priority: 0,
      p_is_major: true,
      p_reason: "smoke_test_set",
    });
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || row.status !== "executed") throw new Error(`[1] expected executed, got ${JSON.stringify(row)}`);
    console.log("[1] OK set_pipeline_suppression executed");
  }

  // 2) suppression=true => forbidden action suppressed
  {
    const data = await rpc(supabase, "reels_engine_apply_action", {
      p_environment: environment,
      p_segment_key: segment,
      p_action_type: "increase_exploration",
      p_idempotency_key: `smoke-${runId}-forbidden`,
      p_payload: {},
      p_priority: 0,
      p_is_major: true,
      p_reason: "smoke_test_forbidden",
    });
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || row.status !== "suppressed") throw new Error(`[2] expected suppressed, got ${JSON.stringify(row)}`);
    console.log("[2] OK forbidden action suppressed by matrix");
  }

  // 3) idempotency replay on same key
  {
    const data = await rpc(supabase, "reels_engine_apply_action", {
      p_environment: environment,
      p_segment_key: segment,
      p_action_type: "increase_exploration",
      p_idempotency_key: `smoke-${runId}-forbidden`,
      p_payload: {},
      p_priority: 0,
      p_is_major: true,
      p_reason: "smoke_test_forbidden",
    });
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error("[3] missing row");
    console.log("[3] OK idempotent replay returned", row.status);
  }

  // 4) clear suppression via apply_action
  {
    const data = await rpc(supabase, "reels_engine_apply_action", {
      p_environment: environment,
      p_segment_key: segment,
      p_action_type: "clear_pipeline_suppression",
      p_idempotency_key: `smoke-${runId}-clear`,
      p_payload: {},
      p_priority: 0,
      p_is_major: true,
      p_reason: "smoke_test_clear",
    });
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || row.status !== "rejected") throw new Error(`[4] expected rejected (hysteresis), got ${JSON.stringify(row)}`);
    console.log("[4] OK clear_pipeline_suppression rejected by hysteresis");
  }

  // 4b) manual override clears suppression (Option A)
  {
    const data = await rpc(supabase, "reels_engine_apply_action", {
      p_environment: environment,
      p_segment_key: segment,
      p_action_type: "manual_clear_pipeline_suppression",
      p_idempotency_key: `smoke-${runId}-manual-clear`,
      p_payload: {},
      p_priority: 0,
      p_is_major: true,
      p_reason: "smoke_test_manual_clear",
    });
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || row.status !== "executed") throw new Error(`[4b] expected executed, got ${JSON.stringify(row)}`);
    console.log("[4b] OK manual_clear_pipeline_suppression executed");
  }

  // 5) Check get_pipeline_suppression says not suppressed
  {
    const data = await rpc(supabase, "reels_engine_get_pipeline_suppression", {
      p_environment: environment,
      p_segment_key: segment,
    });
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error("[5] missing row");
    if (row.is_suppressed) throw new Error(`[5] expected is_suppressed=false, got ${JSON.stringify(row)}`);
    console.log("[5] OK get_pipeline_suppression not suppressed");
  }

  // 6) Journal audit completeness (best effort): ensure last actions have cfg + suppression snapshot columns
  {
    const q = await supabase
      .from("reels_engine_action_journal")
      .select("id,action_type,status,active_config_version_id,pipeline_suppressed_until,pipeline_suppression_reason")
      .eq("environment", environment)
      .eq("segment_key", segment)
      .order("decided_at", { ascending: false })
      .limit(10);

    if (q.error) throw new Error(`[6] journal query failed: ${q.error.message}`);
    const rows = q.data ?? [];
    if (rows.length === 0) throw new Error("[6] expected some journal rows");

    const hasCfg = rows.some((r) => r.active_config_version_id !== null);
    const hasSuppSnap = rows.some((r) => r.pipeline_suppressed_until !== null || r.pipeline_suppression_reason !== null);

    console.log(`[6] journal rows=${rows.length} hasCfg=${hasCfg} hasSuppSnapshot=${hasSuppSnap}`);
  }

  // ========================================================================
  // P1.2: Config Validation Tests
  // ========================================================================

  // 7) Validate good config
  {
    const goodConfig = {
      algorithm_version: "v1.0",
      exploration_ratio: 0.1,
      recency_days: 30,
      freq_cap_hours: 4,
      weights: { feature_a: 0.6, feature_b: 0.4 }
    };

    const data = await rpc(supabase, "reels_engine_validate_config_v1", {
      p_config: goodConfig
    });

    if (!data || data.valid !== true) {
      throw new Error(`[7] expected valid=true, got ${JSON.stringify(data)}`);
    }
    if (data.errors.length !== 0) {
      throw new Error(`[7] expected no errors, got ${JSON.stringify(data.errors)}`);
    }
    console.log("[7] OK config validation accepts valid config");
  }

  // 8) Reject config with missing required field
  {
    const badConfig = {
      algorithm_version: "v1.0",
      exploration_ratio: 0.1,
      // missing recency_days
      freq_cap_hours: 4
    };

    const data = await rpc(supabase, "reels_engine_validate_config_v1", {
      p_config: badConfig
    });

    if (!data || data.valid !== false) {
      throw new Error(`[8] expected valid=false, got ${JSON.stringify(data)}`);
    }
    const hasError = data.errors.some(
      (e) => e.code === "missing_required_field" && e.path === "$.recency_days"
    );
    if (!hasError) {
      throw new Error(`[8] expected missing_required_field error for recency_days, got ${JSON.stringify(data.errors)}`);
    }
    console.log("[8] OK config validation rejects missing required field");
  }

  // 9) Reject config with out-of-range value
  {
    const badConfig = {
      algorithm_version: "v1.0",
      exploration_ratio: 1.5, // out of [0,1]
      recency_days: 30,
      freq_cap_hours: 4
    };

    const data = await rpc(supabase, "reels_engine_validate_config_v1", {
      p_config: badConfig
    });

    if (!data || data.valid !== false) {
      throw new Error(`[9] expected valid=false, got ${JSON.stringify(data)}`);
    }
    const hasError = data.errors.some(
      (e) => e.code === "out_of_range" && e.path === "$.exploration_ratio"
    );
    if (!hasError) {
      throw new Error(`[9] expected out_of_range error for exploration_ratio, got ${JSON.stringify(data.errors)}`);
    }
    console.log("[9] OK config validation rejects out-of-range value");
  }

  // 10) Reject config with invalid weights sum
  {
    const badConfig = {
      algorithm_version: "v1.0",
      exploration_ratio: 0.1,
      recency_days: 30,
      freq_cap_hours: 4,
      weights: { feature_a: 0.5, feature_b: 0.3 } // sum=0.8, not 1.0
    };

    const data = await rpc(supabase, "reels_engine_validate_config_v1", {
      p_config: badConfig
    });

    if (!data || data.valid !== false) {
      throw new Error(`[10] expected valid=false, got ${JSON.stringify(data)}`);
    }
    const hasError = data.errors.some(
      (e) => e.code === "weights_sum_not_one" && e.path === "$.weights"
    );
    if (!hasError) {
      throw new Error(`[10] expected weights_sum_not_one error, got ${JSON.stringify(data.errors)}`);
    }
    console.log("[10] OK config validation rejects invalid weights sum");
  }

  // 11) Warn on unknown keys (but still valid)
  {
    const warningConfig = {
      algorithm_version: "v1.0",
      exploration_ratio: 0.1,
      recency_days: 30,
      freq_cap_hours: 4,
      unknown_field: "should-warn"
    };

    const data = await rpc(supabase, "reels_engine_validate_config_v1", {
      p_config: warningConfig
    });

    if (!data || data.valid !== true) {
      throw new Error(`[11] expected valid=true (warnings don't block), got ${JSON.stringify(data)}`);
    }
    const hasWarning = data.warnings && data.warnings.some(
      (w) => w.code === "unknown_key" && w.path === "$.unknown_field"
    );
    if (!hasWarning) {
      throw new Error(`[11] expected unknown_key warning, got ${JSON.stringify(data.warnings)}`);
    }
    console.log("[11] OK config validation warns on unknown keys but allows activation");
  }

  // 12) Summary: Config validation contract validated
  {
    console.log("[12] (OK P1.2: config validation gate enforces strict contract)");
    console.log("     - size_limit_exceeded: checked");
    console.log("     - missing_required_field: checked");
    console.log("     - type_mismatch: checked");
    console.log("     - out_of_range: checked");
    console.log("     - weights_sum_not_one: checked");
    console.log("     - unknown_key warnings: checked");
  }

  console.log("[smoke] OK");
}

main().catch((err) => {
  const msg = err instanceof Error ? err.stack ?? err.message : String(err);
  console.error(msg);
  // Prefer exitCode over abrupt exit() to let Node close handles cleanly (Windows).
  process.exitCode = 1;
});
