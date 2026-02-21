import process from "node:process";
import fs from "node:fs";
import path from "node:path";

function loadDotEnvIfPresent() {
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

function envInt(name, fallback) {
  const raw = env(name, String(fallback));
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function loadConfig() {
  loadDotEnvIfPresent();

  // Accept Vite-style vars as fallback.
  if (!process.env.SUPABASE_URL && process.env.VITE_SUPABASE_URL) {
    process.env.SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  }

  const supabaseUrl = env("SUPABASE_URL");
  const supabaseServiceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl) throw new Error("Missing env SUPABASE_URL");
  if (!supabaseServiceRoleKey) throw new Error("Missing env SUPABASE_SERVICE_ROLE_KEY");

  const environment = env("REELS_ENV", "prod");

  // Comma-separated. Keep global by default.
  const segments = (env("REELS_SEGMENTS", "global") ?? "global")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Optional parent mapping for support-guards/hierarchical fallback.
  // Example:
  //   REELS_SEGMENT_PARENT_web=global
  //   REELS_SEGMENT_PARENT_android=global
  const segmentParents = new Map();
  for (const [k, v] of Object.entries(process.env)) {
    if (!k.startsWith("REELS_SEGMENT_PARENT_")) continue;
    const child = k.slice("REELS_SEGMENT_PARENT_".length).trim();
    if (!child) continue;
    if (typeof v === "string" && v.trim()) segmentParents.set(child, v.trim());
  }

  return {
    supabaseUrl,
    supabaseServiceRoleKey,
    environment,
    segments,
    segmentParents,

    // Policy knobs (ingestion-only)
    pollIntervalMs: envInt("REELS_ARB_POLL_MS", 30_000),
    windowMinutes: envInt("REELS_ARB_WINDOW_MIN", 10),
    minImpressionsInWindow: envInt("REELS_ARB_MIN_IMPRESSIONS", 1),

    // Idempotency: 5-minute time bucket (reason-independent).
    idempotencyBucketMinutes: envInt("REELS_ARB_IDEMPOTENCY_BUCKET_MIN", 5),

    // Lag policy thresholds (seconds)
    lagSuppressSeconds: envInt("REELS_ARB_LAG_SUPPRESS_SEC", 900),
    lagClearSeconds: envInt("REELS_ARB_LAG_CLEAR_SEC", 180),

    // Hysteresis for clearing suppression
    greenMinutesToClear: envInt("REELS_ARB_GREEN_MIN_TO_CLEAR", 12),

    // Default TTL for suppression if none provided by policy
    suppressionTtlMinutes: envInt("REELS_ARB_SUPPRESSION_TTL_MIN", 45),
  };
}
