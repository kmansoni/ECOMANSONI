/**
 * nav-trips — Trip management proxy for ECOMANSONI Navigation Platform
 *
 * Backend prefix: /api/v1/nav/trips
 *
 * Supported paths:
 *   POST /nav-trips                     — create trip
 *   GET  /nav-trips                     — list user trips (paginated)
 *   GET  /nav-trips/estimate?pickup_lat=...&pickup_lng=...&dropoff_lat=...&dropoff_lng=...
 *                                       — price/ETA estimate (no trip created)
 *   GET  /nav-trips/{id}                — get trip detail
 *   POST /nav-trips/{id}/cancel         — cancel trip
 *   POST /nav-trips/{id}/status         — driver: update trip status
 *   POST /nav-trips/{id}/rate           — submit rating
 *
 * Security:
 *   - JWT verified server-side
 *   - Resource ownership (trip → user) enforced by backend via X-User-Id
 *   - Idempotency: POST /cancel and POST /status are idempotent on backend;
 *     clients SHOULD send Idempotency-Key header (forwarded transparently)
 *   - Estimate endpoint is read-only; no state mutation risk
 *
 * Rate limiting:
 *   Backend enforces per-user-id rate limits; this proxy adds no additional
 *   rate limit layer, relying on Supabase gateway limits.
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { proxyToNavigation } from "../_shared/nav-proxy.ts";

serve((req: Request) =>
  proxyToNavigation(req, {
    stripPrefix: "nav-trips",
    backendBase: "/api/v1/nav/trips",
    allowedMethods: ["GET", "POST", "DELETE"],
  })
);
