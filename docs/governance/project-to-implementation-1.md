# Project To Implementation 1

Единый master-checklist реализации. Этот документ является рабочим планом и источником для команды `project:implementation1:list`.

## 0. Core Lock
- [ ] `ValidationMode: Portable` зафиксирован и соблюдается (`docs/contracts/validation.md`).
- [ ] `packages/ui` назначен каноническим UI-слоем (SSOT).
- [ ] Stage control отделен от SHPL (никаких автономных stage-change).

## 1. SSOT Artifacts
- [ ] `docs/ci/branch-protection.md` содержит `requiredJobsByStage` (`S0/S1/S2`).
- [ ] `docs/migration/stage.json` существует и валиден.
- [ ] `docs/migration/flows.json` существует и валиден.
- [ ] `docs/migration/route-map.json` существует и валиден.
- [ ] `docs/arch/exceptions.json` с budget/TTL/ADR дисциплиной.
- [ ] `docs/arch/transports.json` с budget/TTL/ADR дисциплиной.
- [ ] `docs/adr/template.md` используется для `ARCH-EXCEPTION`.

## 2. UI Platform
- [ ] `FP-UI-001A`: no-new-legacy imports в `S0/S1`.
- [ ] `FP-UI-001B`: global legacy hard-ban в `S2`.
- [ ] `FP-UI-002`: no raw colors outside tokens.
- [ ] `FP-UI-003`: button matrix tests (variant x size x state).
- [ ] `FP-UI-004`: public API boundary (`@mansoni/ui` only, no private imports).
- [ ] Создан `packages/tokens` и подключен как единственный источник raw design values.
- [ ] Создан `packages/ui` с публичным `src/index.ts` и корректным `exports` map.

## 3. Runtime + DAL
- [ ] `FP-ARCH-501A`: features/pages не импортируют gateways/transport libs напрямую.
- [ ] `FP-ARCH-503A`: transport usage only in DAL/runtime paths.
- [ ] `FP-ARCH-503B`: transport allowlist budget/TTL/ADR enforced.
- [ ] `ActionGuard` (double-submit/idempotency lock) введен для critical actions.
- [ ] `CapabilityResolver` + `FeatureGate` введены.
- [ ] `ErrorPolicy` введена с fallback semantics.

## 4. Contracts + Negotiation
- [ ] `FP-CONS-2101`: authoritative entities имеют `version` или `updated_at+etag`.
- [ ] `FP-CONS-2102`: module conflict policy declared (`LWW/Reject/Merge/Resync`).
- [ ] `FP-NEG-2201`: HTTP capabilities baseline enforced.
- [ ] `FP-NEG-2202`: WS mismatch deterministic handling; CI mode = `mock` до ADR.
- [ ] SemVer/deprecation policy для contracts зафиксирована.

## 5. Module Isolation
- [ ] `FP-ARCH-401`: module registry is single source of module wiring.
- [ ] `FP-ARCH-406`: import boundaries enforced across layers.
- [ ] Per-module error boundaries and recovery paths введены.
- [ ] State authority declarations добавлены для модулей.

## 6. Security Boundary
- [ ] `FP-SEC-702A`: telemetry catalog + schema/data_class/env policy enforced.
- [ ] `FP-SEC-703A`: no direct storage API outside runtime wrapper.
- [ ] `FP-SEC-705`: share/clipboard/crash redaction policy enforced.
- [ ] PII-sensitive logging policy для production включена.

## 7. Governance Gates
- [ ] `FP-GOV-8001A`: branch protection audit (internal PRs / token-present).
- [ ] `FP-GOV-8001B`: documented branch contract fallback (stage-aware).
- [ ] `FP-GOV-801`: NDJSON output contract + aggregator completeness.
- [ ] `FP-GOV-8201`: exceptions budget/ADR/TTL enforced.
- [ ] `Artifact Trust Trigger` активен (late NDJSON = invalid).
- [ ] `Policy Drift Trigger` активен (digest mismatch > 1 PR blocks stage change).
- [ ] `Human Override Trigger` активен (manual override without ADR -> incident).

## 8. Migration Discipline
- [ ] `FP-MIG-901`: stage bump gate (blocking criteria + regression guards).
- [ ] `FP-MIG-9102`: weighted migration metrics (non-increasing legacy pressure).
- [ ] Stage bump only through PR changing `stage.json`.
- [ ] Commit integrity uses ancestry check (anti-flake for merge queue/rebase).
- [ ] `route-map` canonical matching wired into critical-flow legacy checks.

## 9. Route-Map v1.0.1 Lock
- [ ] ROUTEMAP-102 hybrid policy enforced (`routerTypeHint=hybrid` + `adrRef`).
- [ ] ROUTEMAP-107B prefix overlap policy enforced (`aliasResolution` deterministic).
- [ ] ROUTEMAP-204 strictness order fixed and monotonic by stage.
- [ ] Stage policy uses `S0: no_match|warn_only`, `S1/S2: fail_closed`.

## 10. S0 -> S1 -> S2 Rollout
- [ ] S0 required-set включен: `governance-core`, `ui-boundaries`, `security-core`, `migration-guard`, `gate-output-contract`.
- [ ] S0 dry-run metrics stable: FP<1%, flake<0.5%, CI delta<15%.
- [ ] S1 shadow preview прошел; blocking rate <5%.
- [ ] S1 activation decision log заполнен и согласован (2/3 GO, security veto).
- [ ] S2 entry criteria выполнены 14 days подряд.
- [ ] S2 hard-ban activated (`FP-UI-001B`, perf fail, strict governance).

## 11. CDD (Anti-Entropy)
- [ ] Weekly drift budgets defined and monitored per domain.
- [ ] AES formula deterministic (`clamp [0..100]`, round half up, 1 decimal).
- [ ] Hard Trigger precedence over AES enforced.
- [ ] Drift escalation ladder active and audited.

## 12. SHPL
- [ ] SHPL guardrails enforced (no stage control, no allowlist expansion).
- [ ] Immutable audit events emitted for all loop actions.
- [ ] Safe scope only: TTL expiry auto, all else proposal mode.
- [ ] Circuit breakers active (`AES < 75`, hard trigger, flaky >1%, CI fail >5%).
- [ ] Rate limits active (max 3 proposals/week; cooldown policy).

## 13. Completion Definition
- [ ] `legacy_imports_total == 0` (production paths).
- [ ] `transport_exceptions_active == 0`.
- [ ] `active_exceptions <= 1`.
- [ ] `unknown routes in active flows == 0`.
- [ ] `governance-audit` required for internal PRs and stable.
- [ ] 14-day stabilization window passed with no rollback triggers.
