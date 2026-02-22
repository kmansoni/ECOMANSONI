/**
 * A1 & E1: Shared utilities for Edge Functions
 * - Rate limiting
 * - CORS with allowed origins
 * - Error handling
 */

// E1: Restrict CORS to specific origins
const ALLOWED_ORIGINS = [
  "https://mansoni.ru",
  "https://app.mansoni.ru",
  "https://kmansoni.github.io",
  "http://localhost:5173",
  "http://localhost:3000",
];

/**
 * Get CORS headers for the request origin
 */
export function getCorsHeaders(requestOrigin: string | null): Record<string, string> {
  const origin = requestOrigin && ALLOWED_ORIGINS.some(allowed => 
    requestOrigin.startsWith(allowed.replace(/\/$/, ''))
  ) ? requestOrigin : ALLOWED_ORIGINS[0];

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}

/**
 * Handle CORS preflight request
 */
export function handleCors(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    const origin = req.headers.get("origin");
    return new Response(null, { headers: getCorsHeaders(origin) });
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
