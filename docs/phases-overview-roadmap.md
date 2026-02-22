# Roadmap Overview — Phases 0–4 (No code)

Дата: 2026-02-22

Цель: зафиксировать 4–5 фаз с границами, длительностью, Must/Won’t, DoD и критериями перехода.

Глобальные правила для всех фаз:
- D0.000 (design compliance) — non-negotiable.
- Server-side enforcement.
- Idempotency everywhere.

---

## Phase 0 — Core MVP (8–12 недель)
**Цель**: стабильный Reels loop + создание + события + базовая модерация + baseline ranking.

Must-have:
- Stable feed contract + fallback
- Playback + event integrity (dedup + sequence rules)
- Create Reels MVP (upload→publish) без дублей
- Minimal moderation gate (blocked не попадает в выдачу)
- Ranking baseline через Reels Engine config gate
- Базовая наблюдаемость + kill-switch plan

Won’t-have:
- Live, ads, payments, marketplace/services, multi-region, AI

DoD:
- Phase 0 acceptance checklist выполнен (см. Phase 0 doc).

Gate → Phase 1 (критерии перехода):
- Feed/playback стабильны (ошибки и пустые страницы в пределах согласованных порогов).
- События не ломаются при ретраях/оффлайне (dedup работает).
- Create не даёт дублей при повторном тапе.
- Есть минимальные метрики и reason-codes для расследования.

---

## Phase 1 — PMF (10–16 недель)
**Цель**: рост удержания через discovery + ranking v2 + creator loop + moderation/anti-abuse v1.

Must-have:
- Explore/Discovery
- Hashtags + Trends (trust-weighted)
- Ranking v2 (diversity/cold-start/negative feedback)
- Creator analytics v1
- Moderation v1 (queues + SLA + appeals базовый)
- Anti-abuse v1 (trust-lite + rate limits)
- Observability rollouts + guardrails + auto-rollback

Won’t-have:
- Ads/монетизация/платежи
- Marketplace/services интеграции
- Multi-region
- Полный AI слой (допустимо только moderation-assist lite при ресурсе)

DoD:
- Phase 1 acceptance checklist выполнен.

Gate → Phase 2:
- Улучшение KPI (retention/session/completion) при неизменных/улучшенных guardrails (report/hide).
- Rollout/rollback реально работает (есть минимум 1 успешный canary rollout с откатом/подтверждением).

---

## Phase 2 — Monetization Stability (12–20 недель)
**Цель**: добавить монетизацию без разрушения безопасности/качества.

Must-have:
- Ads light (caps + brand safety + ad fraud базовый)
- Creator monetization базовая (eligibility + прозрачность)
- Cost observability уровня unit economics (storage/CDN/transcode)
- Усиление anti-abuse вокруг monetization

Won’t-have:
- Массовый live rollout
- Multi-region
- Super-platform сервисы

DoD:
- Монетизация не ухудшает guardrails (report rate, latency, playback).

Gate → Phase 3:
- Положительная unit economics на целевых сегментах.
- Стабильный fraud rate под контролем.

---

## Phase 3 — Scale & Resilience (16–28 недель)
**Цель**: масштабирование, надёжность, compliance-готовность.

Must-have:
- SLO/SLA полные + alerting + incident playbooks
- Disaster recovery (RTO/RPO) + drills
- Data governance + retention
- Частичный multi-region (read-path) при необходимости

Won’t-have:
- Новые бизнес-сервисы (marketplace/realty/insurance/taxi) как продуктовые направления

DoD:
- DR тест восстановлений проходит по графику.

Gate → Phase 4:
- Операционная зрелость (MTTD/MTTR в целевых пределах).

---

## Phase 4 — Super-platform Expansion (ongoing)
**Цель**: подключение сервисов как targets + сквозная конверсия через чат.

Must-have:
- Multi-target publish как платформа для business objects
- Conversion attribution (content→service→chat→deal)
- Trust унифицирован между контентом и сервисами

Won’t-have:
- «Сервисы любой ценой» без готового trust/compliance/ops

DoD:
- Новый service-target добавляется без переписывания ядра publish/ranking.
