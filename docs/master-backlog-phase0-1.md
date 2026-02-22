# Master Backlog — Phase 0 + Phase 1 (Prioritized, tracker-ready)

Дата: 2026-02-22

Источник: [docs/phase0-core-mvp-execution-plan.md](docs/phase0-core-mvp-execution-plan.md) + [docs/phase1-pmf-execution-plan.md](docs/phase1-pmf-execution-plan.md)

Принципы:
- D0.000 чеклист обязателен для каждой Story с UI.
- Любая write-операция — с идемпотентностью (паттерн из чата).
- Server-side enforcement.

---

## P0 (Phase 0) — порядок выполнения

1) EPIC A — Feed Contract + стабильная выдача
- A1 Feed Contract Doc
- A2 Cursor/Semantic Pagination Decision
- A3 Fallback Rules Spec

2) EPIC B — Playback State Machine + Event Integrity
- B1 Playback State Machine Spec
- B2 Event Spec
- B3 Event Idempotency & Dedup Spec
- B4 Invalid Sequence Policy

3) EPIC D — Ranking v1 baseline через Reels Engine configs
- D1 Ranking v1 Spec (baseline)
- D2 Config Schema Extension Plan
- D3 Reason Codes Spec

4) EPIC E — Minimal Moderation Gate
- E1 Moderation Status Contract
- E2 Borderline placeholder decision

5) EPIC C — Create Reels MVP (upload→publish) с идемпотентностью
- C1 Create Flow Behavior Spec
- C2 Upload Constraints Spec
- C3 Publish Idempotency Spec
- C4 Error Taxonomy

6) EPIC F — Observability минимального уровня + Kill-switch plan
- F1 SLO mini-registry
- F2 Kill-switch catalog (план)
- F3 Incident checklist (Phase 0)

Зависимости (коротко):
- B зависит от A.
- D зависит от A+B.
- E зависит от A+D.
- C зависит от B и D0.000.
- F зависит от A–E.

---

## P1 (Phase 1) — порядок выполнения

1) EPIC L — Anti-abuse v1 (Trust-lite + rate limits)
- L1 Trust-lite spec
- L2 Rate limits spec
- L3 Anomaly detection rules

2) EPIC K — Moderation v1 (Queues + SLA + Appeals)
- K1 Queue model + SLA
- K2 Appeals flow
- K3 Borderline distribution policy

3) EPIC M — Observability расширение (Rollouts + Kill-switch hardening)
- M1 SLO/Guardrails registry expansion
- M2 Kill-switch coverage
- M3 Incident playbooks

4) EPIC I — Ranking v2 (Diversity + Cold Start + Negative Feedback)
- I1 Ranking v2 Spec
- I2 Config schema evolution plan
- I3 Guardrails + auto-rollback spec
- I4 Explainability expansion

5) EPIC H — Hashtags + Trends (trust-weighted)
- H1 Canonicalization rules
- H2 Hashtag moderation rules
- H3 Trend spec

6) EPIC G — Explore/Discovery Surface
- G1 Discovery UX Spec
- G2 Candidate sources for Explore
- G3 Discovery ranking contract

7) EPIC J — Creator Analytics (v1)
- J1 Creator metrics spec
- J2 Creator insights UX spec
- J3 Integrity & sampling rules

8) EPIC N — Live beta (только если KPI зелёные)
- N1 Live beta policy
- N2 Live UX spec
- N3 Live safety guardrails

Зависимости (коротко):
- L → (K, H).
- M → (I, G, H) как обязательная страховка экспериментов.
- I → G/H (качество выдачи критично для discovery).
- J зависит от event integrity (Phase 0).
- N зависит от L+K+M.
