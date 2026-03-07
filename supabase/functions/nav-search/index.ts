/**
 * nav-search — Unified search + saved places proxy for ECOMANSONI Navigation Platform
 *
 * Backend prefix: /api/v1/nav (with path rewrite)
 *
 * Supported paths:
 *   GET    /nav-search?q=...              — unified search
 *   GET    /nav-search/history            — user search history
 *   POST   /nav-search/history            — append search history entry
 *   DELETE /nav-search/history/{id}       — delete history entry
 *   GET    /nav-search/saved-places       — list saved places
 *   POST   /nav-search/saved-places       — add saved place
 *   DELETE /nav-search/saved-places/{id}  — remove saved place
 *   PATCH  /nav-search/saved-places/{id}  — update saved place
 *
 * Security:
 *   - JWT verified server-side; X-User-Id comes from verified token only
 *   - DELETE / PATCH require the resource to be owned by this user
 *     (enforced by the backend using X-User-Id)
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { proxyToNavigation } from "../_shared/nav-proxy.ts";

serve((req: Request) =>
  proxyToNavigation(req, {
    stripPrefix: "nav-search",
    backendBase: "/api/v1/nav",
    transformPath: (path: string) => {
      if (path === "/") return "/search";
      if (path.startsWith("/history")) return `/search${path}`;
      if (path.startsWith("/saved-places")) return path;
      return `/search${path}`;
    },
    allowedMethods: ["GET", "POST", "DELETE", "PATCH"],
  })
);
