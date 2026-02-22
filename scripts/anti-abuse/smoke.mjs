import process from "node:process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadDotEnvIfPresent() {
  const candidates = [".env.local", ".env"];
  for (const f of candidates) {
    const p = path.resolve(process.cwd(), f);
    if (!fs.existsSync(p)) continue;
    const raw = fs.readFileSync(p, "utf8");
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

async function rpc(supabase, fn, args) {
  const res = await supabase.rpc(fn, args);
  if (res.error) throw new Error(`${fn} failed: ${res.error.message}`);
  return res.data;
}

async function main() {
  loadDotEnvIfPresent();

  if (!process.env.SUPABASE_URL && process.env.VITE_SUPABASE_URL) {
    process.env.SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  }

  const supabaseUrl = mustEnv("SUPABASE_URL");
  const serviceKey = mustEnv("SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const run = uuid().slice(0, 8);
  const email = `anti-abuse-smoke-${run}@example.com`;
  const password = `pw-${run}-A!1`;

  console.log(`[anti-abuse smoke] run=${run}`);

  const created = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error) throw new Error(`createUser failed: ${created.error.message}`);

  const userId = created.data.user?.id;
  if (!userId) throw new Error("createUser returned no user id");

  console.log(`[1] created user ${userId}`);

  // Record indicators
  await rpc(supabase, "record_spam_indicator_v1", {
    p_user_id: userId,
    p_indicator_type: "rapid_hashtag_spam",
    p_severity: "low",
    p_confidence: 0.6,
    p_evidence: { count: 10, window: "1h" },
    p_source: "automated",
    p_source_user_id: null,
  });

  await rpc(supabase, "record_spam_indicator_v1", {
    p_user_id: userId,
    p_indicator_type: "bot_pattern",
    p_severity: "medium",
    p_confidence: 0.8,
    p_evidence: { interval_ms: 5000 },
    p_source: "automated",
    p_source_user_id: null,
  });

  await rpc(supabase, "record_spam_indicator_v1", {
    p_user_id: userId,
    p_indicator_type: "coordinated_mention",
    p_severity: "high",
    p_confidence: 0.9,
    p_evidence: { accounts: 3 },
    p_source: "automated",
    p_source_user_id: null,
  });

  const baseScore = await rpc(supabase, "compute_user_spam_score_v1", {
    p_user_id: userId,
    p_policy_id: null,
    p_lookback_days: 7,
  });
  const baseRow = Array.isArray(baseScore) ? baseScore[0] : baseScore;

  if (!baseRow) throw new Error("compute_user_spam_score_v1 returned no row");

  console.log(`[2] base spam_score=${baseRow.spam_score} trust_weight=${baseRow.trust_weight} indicators=${baseRow.indicators_count}`);

  if (baseRow.spam_score === null || baseRow.spam_score === undefined) throw new Error("spam_score is null");
  if (baseRow.trust_weight === null || baseRow.trust_weight === undefined) throw new Error("trust_weight is null");
  if (!(Number(baseRow.spam_score) >= 0 && Number(baseRow.spam_score) <= 1)) throw new Error("spam_score out of range");
  if (!(Number(baseRow.trust_weight) >= 0 && Number(baseRow.trust_weight) <= 1)) throw new Error("trust_weight out of range");

  // Coordinated cluster => should flip flag and add penalty.
  const clusterIns = await supabase
    .from("coordinated_behavior_clusters")
    .insert({
      representative_user_id: userId,
      member_user_ids: [userId],
      confidence: 0.95,
      behavior_pattern: "same_hashtag_timing",
      status: "active",
    })
    .select("cluster_id")
    .single();

  if (clusterIns.error) throw new Error(`insert cluster failed: ${clusterIns.error.message}`);
  console.log(`[3] inserted coordinated cluster ${clusterIns.data.cluster_id}`);

  const coordScore = await rpc(supabase, "compute_user_spam_score_v1", {
    p_user_id: userId,
    p_policy_id: null,
    p_lookback_days: 7,
  });
  const coordRow = Array.isArray(coordScore) ? coordScore[0] : coordScore;

  if (!coordRow?.is_coordinated_member) throw new Error("expected is_coordinated_member=true");
  console.log(`[4] coordinated spam_score=${coordRow.spam_score} trust_weight=${coordRow.trust_weight}`);

  if (coordRow.trust_weight === null || coordRow.trust_weight === undefined) throw new Error("coordinated trust_weight is null");

  // Override trust weight
  const ovIns = await supabase
    .from("trust_weight_overrides")
    .insert({
      user_id: userId,
      override_trust_weight: 0.99,
      reason_code: "testing",
      reason_notes: `smoke ${run}`,
      valid_from: new Date(Date.now() - 60_000).toISOString(),
      valid_until: new Date(Date.now() + 10 * 60_000).toISOString(),
    })
    .select("override_id")
    .single();

  if (ovIns.error) throw new Error(`insert override failed: ${ovIns.error.message}`);
  console.log(`[5] inserted override ${ovIns.data.override_id}`);

  const ovScore = await rpc(supabase, "compute_user_spam_score_v1", {
    p_user_id: userId,
    p_policy_id: null,
    p_lookback_days: 7,
  });
  const ovRow = Array.isArray(ovScore) ? ovScore[0] : ovScore;

  if (!ovRow) throw new Error("override compute returned no row");
  if (Number(ovRow.trust_weight) < 0.98) throw new Error(`expected override trust_weight near 0.99, got ${ovRow.trust_weight}`);

  console.log(`[6] override trust_weight=${ovRow.trust_weight} OK`);

  // Cleanup
  const del = await supabase.auth.admin.deleteUser(userId);
  if (del.error) throw new Error(`deleteUser failed: ${del.error.message}`);
  console.log("[7] cleanup OK");

  console.log("[anti-abuse smoke] OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
