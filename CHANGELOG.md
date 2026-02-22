# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
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
