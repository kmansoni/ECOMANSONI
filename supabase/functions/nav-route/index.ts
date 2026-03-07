/**
 * nav-route — Routing proxy for ECOMANSONI Navigation Platform
 *
 * Forwards all routing requests to the Navigation Backend Server.
 *
 * Supported paths (all prefixed /api/v1/nav/route on backend):
 *   POST /nav-route/calculate          — compute turn-by-turn route
 *   POST /nav-route/alternatives       — compute alternative routes
 *   GET  /nav-route/{id}               — get cached route by id
 *   POST /nav-route/{id}/recalculate   — recalculate on deviation
 *   DELETE /nav-route/{id}             — discard route
 *
 * Security:
 *   - JWT verified server-side before any upstream call
 *   - X-User-Id injected from verified token, never from client
 *   - 30 s upstream timeout (DoS hardening)
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { proxyToNavigation } from "../_shared/nav-proxy.ts";

serve((req: Request) =>
  proxyToNavigation(req, {
    stripPrefix: "nav-route",
    backendBase: "/api/v1/nav/route",
    allowedMethods: ["GET", "POST", "DELETE"],
  })
);
