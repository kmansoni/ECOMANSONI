/**
 * Phase 1 hotfix verification: signup probe
 *
 * Verifies that anon signup (auth.users insert) succeeds.
 * Loads VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY from .env.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

function loadDotEnvIfPresent() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf-8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const raw = trimmed.slice(idx + 1).trim();
    const value = raw.replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

function mustEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

loadDotEnvIfPresent();

const url = mustEnv("VITE_SUPABASE_URL");
const anonKey = mustEnv("VITE_SUPABASE_PUBLISHABLE_KEY");

const supabase = createClient(url, anonKey);

const email = `signup-probe+${Date.now()}@example.com`;
const password = "Probe-password-123";

const { data, error } = await supabase.auth.signUp({
  email,
  password,
  options: { data: { full_name: "Signup Probe" } },
});

console.log("email:", email);
console.log("ok:", !error);
if (error) {
  console.log("error:", error.message);
  process.exit(1);
}

console.log("user_id:", data?.user?.id || null);
console.log("session:", !!data?.session);
process.exit(0);
