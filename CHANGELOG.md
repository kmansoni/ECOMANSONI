# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- **Phase 1 EPIC M: Observability v1**
  - Metrics registry: catalog of all observable metrics with SLO targets (`metrics_registry` table)
  - Guardrails: automated thresholds triggering alerts or auto-rollback (`guardrails_config` table)
  - Time-series storage: simple PostgreSQL-based metrics samples (7-day retention)
  - Auto-rollback on breach: guardrails automatically disable feature flags when SLO breached
  - RPC functions: `evaluate_guardrails_v1`, `get_slo_status_v1`, `get_active_guardrail_breaches_v1`, `cleanup_old_metric_samples_v1`
  - Frontend observability client: TypeScript types + API helpers (`src/lib/observability/`)
  - Kill-switch expansion: 6 new feature flags (`personalized_ranking`, `discovery_surface`, `hashtag_trends`, `moderation_queue_processing`, `appeals_flow`, `strict_safety_mode`)
  - Incident playbooks: step-by-step guides for Phase 1 scenarios (`docs/ops/PHASE1_INCIDENT_PLAYBOOKS.md`)
  - E2E test: guardrail breach triggers auto-rollback (`scripts/phase1/test-observability.mjs`)
  - Deployment guide: `docs/ops/PHASE1_EPIC_M_DEPLOYMENT.md` with verification steps
- **Phase 1 EPIC L: Trust & Rate Limiting**
  - Database-backed fixed-window rate limiting (no Redis required for MVP)
  - `rate_limit_audits` table for audit trail and compliance
  - Tier-specific rate limits (Tiers A-D × 6 actions: `send_message`, `media_upload`, `create_post`, `follow`, `search`, `api_call`)
  - Edge Function enforcement in `dm-send-delegated` and `media-upload-authorize` (429 + Retry-After headers)
  - Frontend 429 handling: `RateLimitNotice` component, `rateLimitToast` sonner integration
  - Canary rollout system: `feature_flags` table with hash-based % rollout (0% → 100%)
  - SQL smoke test (`scripts/phase1/test-canary-rollout.sql`) and E2E test (`scripts/phase1/test-rate-limits.mjs`)
  - Operational guide: `docs/ops/CANARY_ROLLOUT_GUIDE.md` for safe production deployment
- Comprehensive `README.md` with features, tech stack, setup instructions, and usage examples
- `ARCHITECTURE.md` documenting frontend–backend integration, infrastructure services, and deployment strategies
- `CONTRIBUTING.md` with branching strategy, commit conventions, and PR process
- `CODE_OF_CONDUCT.md` based on Contributor Covenant 2.1
- `CHANGELOG.md` (this file) for tracking changes over time
- Unit tests for `ARPage` component (render, heading, and state)
- Unit tests for `InsuranceAssistant` component (initial render, suggested questions)
- Enhanced `ARPage` with WebAR scaffolding: camera-access UI, feature checklist, and AR launch button
- GitHub Actions E2E workflow (`.github/workflows/e2e.yml`) running Playwright on each PR

---

## [0.1.0] – 2026-02-21

### Added
- Initial SPA: social feed, reels, real-time chat, real estate, insurance module
- Supabase integration: Postgres, Auth, Realtime, Edge Functions
- WebSocket call server (`server/calls-ws`) and SFU (`server/sfu`)
- Redis-backed rate limiting and pub/sub
- Admin console with JIT role escalation and audit log
- Multi-account context supporting simultaneous Supabase sessions
- Capacitor wrapper for Android/iOS builds
- CI pipeline with lint, backend-safety checks, unit tests, and build step
- E2E smoke test with Playwright

[Unreleased]: https://github.com/kmansoni/ECOMANSONI/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/kmansoni/ECOMANSONI/releases/tag/v0.1.0
