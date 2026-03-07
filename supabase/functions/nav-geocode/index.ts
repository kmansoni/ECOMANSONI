/**
 * nav-geocode — Geocoding proxy for ECOMANSONI Navigation Platform
 *
 * Forwards geocoding queries to the Navigation Backend Server.
 *
 * Supported paths (backend prefix: /api/v1/nav/geocode):
 *   GET /nav-geocode/forward?q=...&lat=...&lng=...   — forward geocoding
 *   GET /nav-geocode/reverse?lat=...&lng=...         — reverse geocoding
 *   GET /nav-geocode/autocomplete?q=...&lat=...&lng= — autocomplete
 *
 * Security:
 *   - JWT verified server-side; q/lat/lng are passed as query params only
 *   - No request body forwarded for GET requests (DoS surface reduction)
 *   - Upstream 30 s timeout
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { proxyToNavigation } from "../_shared/nav-proxy.ts";

serve((req: Request) =>
  proxyToNavigation(req, {
    stripPrefix: "nav-geocode",
    backendBase: "/api/v1/nav/geocode",
    allowedMethods: ["GET"],
  })
);
