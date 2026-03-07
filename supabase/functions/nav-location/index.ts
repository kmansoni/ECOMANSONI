/**
 * nav-location — Location ingest + nearby query proxy for ECOMANSONI Navigation Platform
 *
 * Backend prefix: /api/v1/nav/location
 *
 * Supported paths:
 *   POST   /nav-location/update          — single GPS position update
 *   POST   /nav-location/batch           — batch GPS positions (flush on resume)
 *   GET    /nav-location/nearby?lat=...&lng=...&radius=...&type=...
 *                                        — nearby drivers / POIs
 *   POST   /nav-location/share           — start ephemeral location share
 *   DELETE /nav-location/share/{id}      — stop location share
 *   GET    /nav-location/share/{id}      — get share snapshot
 *
 * Security:
 *   - JWT verified server-side
 *   - GPS coordinates are NOT validated here; backend validates range [-90,90] / [-180,180]
 *   - Location share tokens are single-use and time-scoped on the backend
 *   - Batch endpoint limited to 100 points max (enforced by backend)
 *
 * Privacy:
 *   - X-User-Id from verified JWT only; never trust client-supplied user_id in body
 *   - Backend must enforce that location updates are only stored for the authenticated user
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { proxyToNavigation } from "../_shared/nav-proxy.ts";

serve((req: Request) =>
  proxyToNavigation(req, {
    stripPrefix: "nav-location",
    backendBase: "/api/v1/nav/location",
    allowedMethods: ["GET", "POST", "DELETE"],
  })
);
