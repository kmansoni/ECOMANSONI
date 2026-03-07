/**
 * nav-reports — Crowdsource reports proxy for ECOMANSONI Navigation Platform
 *
 * Backend prefix: /api/v1/nav/reports
 *
 * Supported paths:
 *   POST /nav-reports                          — submit incident report
 *                                               body: { type, lat, lng, description? }
 *   POST /nav-reports/{id}/vote                — upvote / downvote report
 *                                               body: { vote: "up" | "down" }
 *   DELETE /nav-reports/{id}                    — retract own report
 *   GET  /nav-reports/nearby?lat=...&lng=...&radius=...&type=...
 *                                               — reports near location
 *   GET  /nav-reports/heatmap?min_lat=...&min_lng=...&max_lat=...&max_lng=...
 *                                               — density heatmap tiles
 *
 * Security:
 *   - JWT verified server-side; X-User-Id from token used for rate limiting
 *     (backend enforces max 10 reports / user / hour)
 *   - Vote deduplication enforced by backend (one vote per user per report)
 *   - DELETE only allowed for report.user_id = X-User-Id (enforced by backend)
 *   - Bounding box for heatmap capped at 1° × 1° on backend to prevent scraping
 *
 * Abuse mitigation:
 *   - Coordinate fuzzing applied server-side to anonymise exact reporter position
 *   - Report content moderation queue managed by backend moderation service
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { proxyToNavigation } from "../_shared/nav-proxy.ts";

serve((req: Request) =>
  proxyToNavigation(req, {
    stripPrefix: "nav-reports",
    backendBase: "/api/v1/nav/reports",
    allowedMethods: ["GET", "POST", "DELETE"],
  })
);
