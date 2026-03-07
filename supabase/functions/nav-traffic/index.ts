/**
 * nav-traffic — Traffic data proxy for ECOMANSONI Navigation Platform
 *
 * Backend prefix: /api/v1/nav/traffic
 *
 * Supported paths:
 *   GET /nav-traffic/area?min_lat=...&min_lng=...&max_lat=...&max_lng=...
 *                                        — traffic segments for bounding box
 *   GET /nav-traffic/summary             — city-wide congestion summary
 *   GET /nav-traffic/route?route_id=...  — traffic overlay for a computed route
 *
 * Security:
 *   - JWT verified server-side for all queries
 *   - Bounding box validation (area not > 0.5° × 0.5°) enforced by backend
 *     to prevent data-dump attacks
 *   - Traffic data is read-only from this proxy; no mutation paths
 *   - Responses are cacheable (backend sets Cache-Control); relay it here
 *
 * Observability:
 *   - X-Trace-Id forwarded to backend for distributed tracing correlation
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { proxyToNavigation } from "../_shared/nav-proxy.ts";

serve((req: Request) =>
  proxyToNavigation(req, {
    stripPrefix: "nav-traffic",
    backendBase: "/api/v1/nav/traffic",
    allowedMethods: ["GET"],
  })
);
