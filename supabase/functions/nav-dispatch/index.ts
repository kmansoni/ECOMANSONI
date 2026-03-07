/**
 * nav-dispatch — Driver dispatch proxy for ECOMANSONI Navigation Platform
 *
 * Backend prefix: /api/v1/nav/dispatch
 *
 * Supported paths:
 *   GET  /nav-dispatch/offers               — list pending trip offers for driver
 *   POST /nav-dispatch/offers/{id}/respond  — accept or reject an offer
 *                                             body: { action: "accept" | "reject" }
 *   POST /nav-dispatch/availability         — toggle driver online/offline
 *                                             body: { available: boolean, lat: number, lng: number }
 *   GET  /nav-dispatch/stats                — current session stats for driver
 *
 * Security:
 *   - JWT verified server-side; driver identity comes from X-User-Id only
 *   - Backend enforces that the responding driver is the one the offer was sent to
 *   - Race condition on offer acceptance handled by backend optimistic locking
 *     (offer.version field checked in UPDATE … WHERE version = $n)
 *   - Availability change is idempotent — duplicate calls are safe
 *
 * Concurrency notes:
 *   - Two drivers cannot accept the same offer simultaneously:
 *     backend uses SELECT … FOR UPDATE SKIP LOCKED on dispatch_offers table
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { proxyToNavigation } from "../_shared/nav-proxy.ts";

serve((req: Request) =>
  proxyToNavigation(req, {
    stripPrefix: "nav-dispatch",
    backendBase: "/api/v1/nav/dispatch",
    allowedMethods: ["GET", "POST"],
  })
);
