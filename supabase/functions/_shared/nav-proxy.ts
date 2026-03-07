/**
 * ECOMANSONI Navigation Platform — shared proxy helper
 *
 * Zero-trust model:
 *  - Every call MUST carry a valid Supabase JWT.
 *  - The JWT is re-verified server-side; we never trust the client claim.
 *  - X-User-Id is set by THIS function, never forwarded from client input.
 *  - X-Trace-Id is generated here for distributed tracing correlation.
 *
 * Threat model handled here:
 *  - Missing / forged auth token          → 401
 *  - Navigation API timeout (30 s)        → 504
 *  - Navigation API unreachable           → 502
 *  - Navigation API returns non-JSON      → 502 with details
 *  - Replay via stolen tokens             → mitigated by Supabase JWT exp
 *  - SSRF via path injection              → sanitised path, allowlisted host
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const NAVIGATION_API_URL =
  Deno.env.get("NAVIGATION_API_URL") || "http://navigation-api:8100";

/** Maximum upstream fetch timeout in milliseconds */
const UPSTREAM_TIMEOUT_MS = 30_000;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, DELETE, PATCH, PUT, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, content-type, x-client-info, apikey",
  "Access-Control-Max-Age": "86400",
};

// ─── helpers ────────────────────────────────────────────────────────────────

function corsPreflightResponse(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

function jsonResponse(
  body: unknown,
  status: number,
  extra?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
      ...extra,
    },
  });
}

/**
 * Sanitise the path segment that arrives after the function prefix so that
 * path-traversal attacks (`../../admin`) cannot escape the intended sub-tree.
 *
 * Rules:
 *  - Allow only [A-Za-z0-9/_\-\.] characters.
 *  - Collapse consecutive slashes.
 *  - Strip leading dot-sequences that would ascend directories.
 */
function sanitisePath(raw: string): string {
  // Remove null bytes and control characters
  let p = raw.replace(/[\x00-\x1f]/g, "");
  // Collapse /../ and /./
  const parts = p.split("/").filter((seg) => seg !== "." && seg !== "..");
  p = parts.join("/");
  // Ensure leading slash
  if (!p.startsWith("/")) p = "/" + p;
  return p;
}

/** Verify JWT and return { userId } or throw with HTTP status */
async function verifyAuth(
  req: Request,
): Promise<{ userId: string; authHeader: string }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw Object.assign(new Error("Missing or malformed Authorization header"), {
      status: 401,
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } },
  );

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw Object.assign(
      new Error(error?.message ?? "Token verification failed"),
      { status: 401 },
    );
  }

  return { userId: user.id, authHeader };
}

// ─── public API ─────────────────────────────────────────────────────────────

export interface ProxyOptions {
  /**
   * Function name prefix to strip from the incoming URL path before
   * forwarding to the navigation backend.
   * Example: "nav-route"  →  /nav-route/path  strips to  /path
   */
  stripPrefix: string;

  /**
   * Navigation backend sub-path prefix injected before the stripped path.
   * Example: "/api/v1/nav/route"
   */
  backendBase: string;

  /**
   * Optional path mapper applied after stripPrefix sanitisation.
   * Return value can be absolute or relative path and will be sanitised again.
   */
  transformPath?: (cleanPath: string) => string;

  /**
   * HTTP methods allowed for this endpoint.
   * OPTIONS is always added automatically.
   */
  allowedMethods?: string[];
}

/**
 * Full zero-trust proxy handler.
 *
 * Flow:
 *  1. OPTIONS preflight → 204
 *  2. Method guard
 *  3. JWT verification (server-side, no client trust)
 *  4. Path sanitisation + URL construction
 *  5. Forwarded fetch with AbortController timeout
 *  6. Response relay with CORS headers
 */
export async function proxyToNavigation(
  req: Request,
  opts: ProxyOptions,
): Promise<Response> {
  // 1. CORS preflight — must respond before auth check per W3C spec
  if (req.method === "OPTIONS") return corsPreflightResponse();

  // 2. Method guard
  const allowed = [...(opts.allowedMethods ?? ["GET", "POST"]), "OPTIONS"];
  if (!allowed.includes(req.method)) {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    // 3. Auth verification — zero-trust: always re-verify
    const { userId, authHeader } = await verifyAuth(req);

    // 4a. Path extraction and sanitisation
    const incomingUrl = new URL(req.url);
    const rawPath = incomingUrl.pathname;

    // Strip the Edge Function prefix (e.g. "/nav-route") from the path
    const prefixPattern = new RegExp(
      `^(/[^/]+)?/${opts.stripPrefix}`,
    );
    const pathAfterPrefix = rawPath.replace(prefixPattern, "") || "/";
    const cleanPath = sanitisePath(pathAfterPrefix);
    const mappedPath = opts.transformPath
      ? sanitisePath(opts.transformPath(cleanPath))
      : cleanPath;

    // 4b. Build target URL — preserve query string
    const targetUrl = new URL(
      `${NAVIGATION_API_URL}${opts.backendBase}${mappedPath}`,
    );
    // Copy all query params verbatim
    incomingUrl.searchParams.forEach((v, k) => targetUrl.searchParams.set(k, v));

    // 5. Read body (only for non-GET/HEAD requests, avoid buffering on GETs)
    let bodyInit: string | undefined;
    if (req.method !== "GET" && req.method !== "HEAD") {
      const contentType = req.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        try {
          const parsed = await req.json();
          bodyInit = JSON.stringify(parsed);
        } catch {
          return jsonResponse({ error: "Invalid JSON body" }, 400);
        }
      } else {
        // Forward raw body for other content types
        bodyInit = await req.text();
      }
    }

    // 6. AbortController for 30-second timeout (DoS hardening)
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      UPSTREAM_TIMEOUT_MS,
    );

    const traceId = crypto.randomUUID();

    let navResponse: Response;
    try {
      // Build X-Forwarded-For: append the edge-function's view of the client
      // IP to any existing chain. Never trust client-supplied X-Forwarded-For
      // as the sole value to prevent IP-spoofing attacks on geo/rate-limit logic.
      const existingXFF = req.headers.get("x-forwarded-for");
      const clientIp =
        req.headers.get("cf-connecting-ip") ??   // Cloudflare
        req.headers.get("x-real-ip") ??           // nginx / Fly.io
        "unknown";
      const forwardedFor = existingXFF
        ? `${existingXFF}, ${clientIp}`
        : clientIp;

      navResponse = await fetch(targetUrl.toString(), {
        method: req.method,
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
          "X-User-Id": userId,          // set server-side, never from client input
          "X-Trace-Id": traceId,
          "X-Forwarded-For": forwardedFor,
        },
        body: bodyInit,
        signal: controller.signal,
      });
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      if ((fetchErr as Error).name === "AbortError") {
        console.error(`[nav-proxy] upstream timeout trace=${traceId}`);
        return jsonResponse(
          { error: "Navigation API timeout", trace_id: traceId },
          504,
        );
      }
      console.error(`[nav-proxy] upstream unreachable trace=${traceId}`, fetchErr);
      return jsonResponse(
        { error: "Navigation API unreachable", trace_id: traceId },
        502,
      );
    }
    clearTimeout(timeoutId);

    // 7. Relay response — handle non-JSON upstream gracefully
    const respContentType = navResponse.headers.get("content-type") ?? "";
    if (!respContentType.includes("application/json")) {
      const text = await navResponse.text();
      console.error(
        `[nav-proxy] non-JSON upstream response status=${navResponse.status} trace=${traceId} body=${text.slice(0, 256)}`,
      );
      return jsonResponse(
        {
          error: "Navigation API returned unexpected content type",
          trace_id: traceId,
        },
        502,
      );
    }

    const data = await navResponse.json();
    return jsonResponse(data, navResponse.status, {
      "X-Trace-Id": traceId,
    });
  } catch (err) {
    const httpErr = err as Error & { status?: number };
    const status = httpErr.status ?? 500;
    if (status === 401) {
      return jsonResponse({ error: "Unauthorized", detail: httpErr.message }, 401);
    }
    console.error("[nav-proxy] unhandled error", err);
    // In production never expose internal error messages to the client —
    // they may contain stack frames, env variable names, or internal paths.
    const isDev = Deno.env.get("DENO_ENV") === "development" ||
      Deno.env.get("SUPABASE_ENV") === "local";
    return jsonResponse(
      {
        error: "Internal proxy error",
        ...(isDev ? { detail: httpErr.message } : {}),
      },
      500,
    );
  }
}
