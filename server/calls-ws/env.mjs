import fs from "node:fs";
import path from "node:path";

export function normalizeEnvValue(value) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/^['"]+|['"]+$/g, "").trim();
}

export function readOptionalStringEnv(name) {
  return normalizeEnvValue(process.env[name]);
}

export function readPositiveIntEnv(name, fallback, { min = 1, max } = {}) {
  const raw = readOptionalStringEnv(name);
  if (!raw) return fallback;

  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || (max != null && value > max)) {
    const maxPart = max != null ? ` and <= ${max}` : "";
    throw new Error(`[calls-ws] Invalid ${name}: expected integer >= ${min}${maxPart}, got ${JSON.stringify(raw)}`);
  }

  return value;
}

export const NODE_ENV = readOptionalStringEnv("NODE_ENV").toLowerCase();
export const ENV = readOptionalStringEnv("ENV").toLowerCase();
export const IS_PROD_LIKE = NODE_ENV === "production" || ENV === "prod" || ENV === "production";
export const CALLS_DEV_INSECURE_AUTH = process.env.CALLS_DEV_INSECURE_AUTH === "1";

let cachedSupabaseEnv = null;
let cachedJoinTokenSecret = null;

function parseDotEnvFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return {};
    const text = fs.readFileSync(filePath, "utf8");
    const map = {};
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      const value = normalizeEnvValue(line.slice(eq + 1));
      if (key) map[key] = value;
    }
    return map;
  } catch {
    return {};
  }
}

export function getSupabaseAuthEnv() {
  if (cachedSupabaseEnv) return cachedSupabaseEnv;

  const root = process.cwd();
  const envFromFiles = {
    ...parseDotEnvFile(path.join(root, ".env")),
    ...parseDotEnvFile(path.join(root, ".env.local")),
    ...parseDotEnvFile(path.join(root, ".env.production")),
  };

  const read = (...keys) => {
    for (const key of keys) {
      const envValue = normalizeEnvValue(process.env[key]);
      if (envValue) return envValue;
      const fileValue = normalizeEnvValue(envFromFiles[key]);
      if (fileValue) return fileValue;
    }
    return "";
  };

  cachedSupabaseEnv = {
    supabaseUrl: read("SUPABASE_URL", "VITE_SUPABASE_URL"),
    supabaseAnonKey: read(
      "SUPABASE_ANON_KEY",
      "SUPABASE_PUBLISHABLE_KEY",
      "VITE_SUPABASE_PUBLISHABLE_KEY",
      "VITE_SUPABASE_ANON_KEY",
    ),
  };

  return cachedSupabaseEnv;
}

export function getJoinTokenSecret() {
  if (cachedJoinTokenSecret) return cachedJoinTokenSecret;

  const explicit = readOptionalStringEnv("CALLS_JOIN_TOKEN_SECRET");
  if (explicit) {
    if (explicit.length < 32) {
      throw new Error("[calls-ws] CALLS_JOIN_TOKEN_SECRET must be at least 32 characters");
    }
    cachedJoinTokenSecret = explicit;
    return cachedJoinTokenSecret;
  }

  const supabaseJwtSecret = readOptionalStringEnv("SUPABASE_JWT_SECRET");
  if (supabaseJwtSecret) {
    if (supabaseJwtSecret.length < 32) {
      throw new Error("[calls-ws] SUPABASE_JWT_SECRET must be at least 32 characters when used for join token signing");
    }
    console.warn(
      IS_PROD_LIKE
        ? "[calls-ws] Missing CALLS_JOIN_TOKEN_SECRET, using SUPABASE_JWT_SECRET fallback in production-like environment"
        : "[calls-ws] Using SUPABASE_JWT_SECRET fallback for join token signing in non-prod environment"
    );
    cachedJoinTokenSecret = supabaseJwtSecret;
    return cachedJoinTokenSecret;
  }

  if (IS_PROD_LIKE) {
    throw new Error("[calls-ws] Missing CALLS_JOIN_TOKEN_SECRET or SUPABASE_JWT_SECRET in production-like environment");
  }

  console.warn("[calls-ws] Using development-only join token secret (non-prod only)");
  cachedJoinTokenSecret = "dev-only-join-token-secret";
  return cachedJoinTokenSecret;
}

export function validateStartupEnv() {
  if (CALLS_DEV_INSECURE_AUTH && IS_PROD_LIKE) {
    throw new Error("CALLS_DEV_INSECURE_AUTH is forbidden in production-like environments");
  }
  if (CALLS_DEV_INSECURE_AUTH) {
    console.warn("[SECURITY] WARNING: CALLS_DEV_INSECURE_AUTH is enabled - DO NOT USE IN PRODUCTION");
  }

  getJoinTokenSecret();

  if (CALLS_DEV_INSECURE_AUTH) return;

  const { supabaseUrl, supabaseAnonKey } = getSupabaseAuthEnv();
  if (!supabaseUrl || !supabaseAnonKey) {
    if (IS_PROD_LIKE) {
      throw new Error("[calls-ws] Missing Supabase auth env vars in production-like environment");
    }
    console.error("[calls-ws] Missing Supabase auth env vars; auth validation is fail-closed");
  }
}
