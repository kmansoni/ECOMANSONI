/**
 * nav-surge — Surge pricing proxy for ECOMANSONI Navigation Platform
 *
 * Backend prefix: /api/v1/nav/surge
 *
 * Supported paths:
 *   GET /nav-surge?lat=...&lng=...
 *                     — surge multiplier for a single point
 *   GET /nav-surge/map?min_lat=...&min_lng=...&max_lat=...&max_lng=...
 *                     — surge multiplier grid for bounding box (vector tiles)
 *   GET /nav-surge/zones
 *                     — list of all active surge zones with polygons + multipliers
 *
 * Security:
 *   - JWT verified server-side for all queries
 *   - Surge data is read-only; no mutation paths exposed
 *   - Bounding box capped to 1° × 1° by backend (prevents full-map scraping
 *     that could expose competitive intelligence)
 *   - Responses include Cache-Control: max-age=30 (data refreshes every 30 s);
 *     the backend response header is relayed transparently
 *
 * Observability:
 *   - X-Trace-Id forwarded for distributed tracing
 *   - Backend emits surge.query metric tagged with user_id for analytics
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { proxyToNavigation } from "../_shared/nav-proxy.ts";

serve((req: Request) =>
  proxyToNavigation(req, {
    stripPrefix: "nav-surge",
    backendBase: "/api/v1/nav/surge",
    allowedMethods: ["GET"],
  })
);
