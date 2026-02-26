/**
 * Timeweb Cloud PostgreSQL Client
 * 
 * Используется для основных данных (profiles, posts, messages, reels)
 * Supabase остается для Auth и TURN credentials (WebRTC звонки)
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { createFetchWithTimeout } from "@/lib/network/fetchWithTimeout";

function normalizeEnv(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .replace(/^["']+|["']+$/g, "")
    .replace(/\s+/g, "");
}

// Timeweb Cloud configuration
const TIMEWEB_API_URL = normalizeEnv(import.meta.env.VITE_TIMEWEB_API_URL);
const TIMEWEB_API_KEY = normalizeEnv(import.meta.env.VITE_TIMEWEB_API_KEY);

// Fallback to Supabase if Timeweb not configured (for gradual migration)
const USE_TIMEWEB = !!(TIMEWEB_API_URL && TIMEWEB_API_KEY);

if (import.meta.env.DEV) {
  console.info("[Timeweb] Configuration", {
    enabled: USE_TIMEWEB,
    apiUrl: TIMEWEB_API_URL || "(not configured)",
  });
}

/**
 * Timeweb PostgreSQL client через PostgREST
 * Используется для всех данных кроме Auth и TURN
 */
export const timewebClient = USE_TIMEWEB
  ? createClient<Database>(TIMEWEB_API_URL, TIMEWEB_API_KEY, {
      global: {
        fetch: createFetchWithTimeout({ timeoutMs: 45_000 }),
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null;

export const isTimewebEnabled = USE_TIMEWEB;
