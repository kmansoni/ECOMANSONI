/**
 * A1 & E1: Shared utilities for Edge Functions
 * - Rate limiting
 * - CORS with allowed origins
 * - Error handling
 */

const LOCALHOST_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:3000",
];

function parseAllowedOrigins(): string[] {
  const raw = (Deno.env.get("CORS_ALLOWED_ORIGINS") ?? "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/\/$/, ""));
}

export function isProductionEnv(): boolean {
  const env = (
    Deno.env.get("ENV") ??
    Deno.env.get("DENO_ENV") ??
    Deno.env.get("NODE_ENV") ??
    ""
  ).toLowerCase();
  if (env === "prod" || env === "production") return true;

  const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").toLowerCase();
  if (!supabaseUrl) return true;
  if (supabaseUrl.includes("localhost") || supabaseUrl.includes("127.0.0.1")) return false;
  return true;
}

function getAllowedOrigins(): string[] {
  const allowed = parseAllowedOrigins();
  if (allowed.length > 0) return allowed;
  if (!isProductionEnv()) return LOCALHOST_ORIGINS.map((s) => s.replace(/\/$/, ""));
  return [];
}

function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return true; // Non-browser clients
  const normalized = origin.replace(/\/$/, "");
  const allowed = getAllowedOrigins();
  if (allowed.length === 0) return false;
  return allowed.includes(normalized);
}

/**
 * Get CORS headers for the request origin
 */
export function getCorsHeaders(requestOrigin: string | null): Record<string, string> {
  const originAllowed = isOriginAllowed(requestOrigin);
  const origin = originAllowed && requestOrigin ? requestOrigin : "null";

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

/**
 * Handle CORS preflight request
 */
export function handleCors(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    const origin = req.headers.get("origin");
    if (!isOriginAllowed(origin)) {
      return new Response("forbidden", { status: 403, headers: getCorsHeaders(origin) });
    }
    return new Response(null, { status: 204, headers: getCorsHeaders(origin) });
  }
  return null;
}

export function enforceCors(req: Request): Response | null {
  const origin = req.headers.get("origin");
  if (!origin) return null;
  if (!isOriginAllowed(origin)) {
    return new Response("forbidden", { status: 403, headers: getCorsHeaders(origin) });
  }
  return null;
}

// A1: Simple in-memory rate limiting (resets on function cold start)
// For production, use Redis or Supabase table
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 60; // 60 requests per minute

/**
 * Check rate limit for a given key (usually IP or user ID)
 * Returns true if request should be allowed
 */
export function checkRateLimit(key: string): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetTime) {
    // New window
    rateLimitMap.set(key, {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW,
    });
    return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - 1, resetIn: RATE_LIMIT_WINDOW };
  }

  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    return { 
      allowed: false, 
      remaining: 0, 
      resetIn: entry.resetTime - now 
    };
  }

  entry.count++;
  return { 
    allowed: true, 
    remaining: RATE_LIMIT_MAX_REQUESTS - entry.count, 
    resetIn: entry.resetTime - now 
  };
}

/**
 * Get client identifier for rate limiting
 */
export function getClientId(req: Request): string {
  // Try to get user ID from auth header, fallback to IP
  const authHeader = req.headers.get("authorization");
  if (authHeader) {
    // Hash the auth header for privacy
    return `auth:${hashString(authHeader)}`;
  }
  
  // Use forwarded IP or connection IP
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "unknown";
  return `ip:${ip}`;
}

/**
 * Simple string hash for privacy
 */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

/**
 * Create rate limit exceeded response
 */
export function rateLimitResponse(resetIn: number, origin: string | null): Response {
  return new Response(
    JSON.stringify({ 
      error: "Too many requests", 
      retryAfter: Math.ceil(resetIn / 1000) 
    }),
    {
      status: 429,
      headers: {
        ...getCorsHeaders(origin),
        "Content-Type": "application/json",
        "Retry-After": String(Math.ceil(resetIn / 1000)),
      },
    }
  );
}

/**
 * Standard error response
 */
export function errorResponse(
  message: string, 
  status: number, 
  origin: string | null
): Response {
  return new Response(
    JSON.stringify({ error: message }),
    {
      status,
      headers: {
        ...getCorsHeaders(origin),
        "Content-Type": "application/json",
      },
    }
  );
}
