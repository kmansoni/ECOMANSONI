# Critical Remediation Tracker

Updated: 2026-03-26

## C1. State fragmentation (critical)
Goal: stop uncontrolled state growth and converge to a domain-store strategy.

Phase 1 (this sprint)
- [ ] Inventory all global/runtime state containers (`contexts`, `stores`, domain hooks).
- [ ] Define allowed state layers: `UI local`, `domain store`, `server state`.
- [ ] Ban new cross-domain state in page components.

Phase 2
- [ ] Migrate top-risk domains (chat/calls/reels) to explicit domain boundaries.
- [ ] Introduce adapter layer for legacy hooks to avoid breaking UI during migration.

Phase 3
- [ ] Remove deprecated stores/contexts and lock architecture via CI checks.

Definition of done
- New state additions follow documented layers.
- Legacy cross-domain states removed from critical flows.

## C2. "20 products instead of 1" (critical)
Goal: converge to a single product kernel with optional modules.

Phase 1 (this sprint)
- [ ] Establish Product Kernel contract (navigation, auth, profile, chat baseline).
- [ ] Mark non-kernel domains as optional modules.

Phase 2
- [ ] Introduce module gating config and route-level ownership.
- [ ] Move module-specific bootstrap code out of core app path.

Phase 3
- [ ] Split build/runtime bundles by module ownership and enforce ownership boundaries.

Definition of done
- Core app can run without optional modules.
- Optional domains are independently toggleable.

## C3. AI Engine is not fully connected (critical)
Goal: ensure production-grade AI path via server-side edge integration.

Phase 1 (completed)
- [x] Fix AI edge authorization in chat page to use user access token when available.
- [x] Keep anon fallback only for non-auth flows.
- [x] Remove unsafe HTML escaping bug in assistant rendering.

Phase 2
- [ ] Unify all AI calls (`AIAssistantPage`, `useAIAssistant`) via single API module.
- [ ] Add health-check and telemetry for AI provider routing.

Phase 3
- [ ] Add E2E tests for AI happy-path and fallback-path.

Definition of done
- AI replies work consistently with deployed edge function.
- No duplicated AI transport logic across app surfaces.

## Fast risk reductions completed now
- [x] Production version is no longer `0.0.0`.
- [x] Vite HMR overlay enabled for visible dev errors.
- [x] `supabase/seed.sql` baseline added.
- [x] `scripts/.temp/` excluded from VCS.
