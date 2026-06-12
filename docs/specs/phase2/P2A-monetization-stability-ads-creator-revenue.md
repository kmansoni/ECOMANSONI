# P2A — Monetization Stability Spec (Phase 2)

Дата: 2026-02-22

Статус: Draft (проектирование)

Цель Phase 2: добавить монетизацию **без разрушения** качества выдачи, безопасности и доверия.

Фокус: Ads light + creator revenue baseline + ad fraud защиты + unit economics наблюдаемость.

Входные спеки (зависимости):
- Trust/enforcement: [docs/specs/phase1/P1L-trust-lite-rate-limits-enforcement.md](docs/specs/phase1/P1L-trust-lite-rate-limits-enforcement.md)
- Moderation v1: [docs/specs/phase1/P1K-moderation-queues-sla-appeals-borderline.md](docs/specs/phase1/P1K-moderation-queues-sla-appeals-borderline.md)
- Ranking v2 + guardrails: [docs/specs/phase1/P1I-ranking-v2-coldstart-diversity-rollback.md](docs/specs/phase1/P1I-ranking-v2-coldstart-diversity-rollback.md)
- Rollouts/auto-rollback: [docs/specs/phase1/P1M-rollouts-guardrails-autorevert.md](docs/specs/phase1/P1M-rollouts-guardrails-autorevert.md)
- Phase 0 SLO/killswitch: [docs/specs/phase0/P0F-observability-slo-killswitch.md](docs/specs/phase0/P0F-observability-slo-killswitch.md)

---

## 0) Ненарушаемые правила

- D0.000: Ads выглядят нативно (ваш стиль), без “чужих баннеров”.
- Brand safety: реклама не показывается рядом с borderline/red.
- Ad fraud: засчитываем только валидные показы (viewability rules).
- Guardrails: любые монетизационные изменения проходят canary + auto-rollback.

---

## 1) Ads light (Phase 2)

### 1.1 Ads как first-class feed item
Ad item должен иметь:
- `ad_id`
- `campaign_id`
- `creative_id`
- `targeting_meta` (сегмент/регион/язык)
- `brand_safety_level`
- `expires_at`

### 1.2 Placement rules
- max 1 ad на 10 organic items (baseline)
- ads не идут подряд
- ads не вставляются сразу после негативного сигнала (hide/report)

### 1.3 Frequency caps
Per viewer:
- session cap
- daily cap

Caps зависят от trust tier (Tier D получает меньше рекламных показов, чтобы снизить стимулы накрутки).

---

## 2) Ad measurement (viewability + events)

### 2.1 Valid ad impression
Impression для рекламы считается только если:
- ad был видим ≥ 50% ≥ 1000ms
- playback реально стартовал (для видео‑креатива)

### 2.2 Invalid traffic detection
Флаги:
- слишком высокая скорость скролла
- аномально высокий CTR
- повторяемые паттерны устройств

Invalid traffic:
- не засчитывается
- снижает trust

---

## 3) Brand safety + adjacency rules

### 3.1 Content eligibility
Реклама показывается только рядом с:
- green контентом
- контентом без high report/hide risk

### 3.2 Topic exclusions
Campaign может исключать категории/теги/аудио.

---

## 4) Creator revenue baseline

### 4.1 Eligibility
Creator eligible если:
- trust tier A/B
- нет повторных нарушений
- контент не borderline/red

### 4.2 Revenue transparency
Creator dashboard показывает:
- gross
- deductions
- net
- период

---

## 5) Anti-abuse интеграция

- Любые подозрительные ad события усиливают enforcement (P1L).
- Массовая попытка накрутки CTR → E3 distribution restricted.

---

## 6) Unit economics observability (обязательное)

Метрики:
- `revenue_per_1k_impressions`
- `cost_per_1k_impressions` (storage+CDN+transcode proxy)
- `margin_per_1k_impressions`
- `invalid_traffic_rate`

Алерты:
- margin < 0 на ключевых сегментах
- invalid_traffic_rate spike

---

## 7) Kill-switch (Phase 2)

- `disable_ads_in_feed`
- `ads_safe_mode` (только контент категории safe)
- `disable_creator_payouts` (в случае fraud/ошибок расчёта)

---

## 8) Rollouts + auto-rollback

Любой ad/monetization конфиг:
- canary 1%→10%→50%→100%
- guardrails:
  - report/hide rate не ухудшать
  - feed latency не ухудшать
  - playback start failure не ухудшать

Rollback:
- выключить ads
- откатить конфиг

---

## 9) Acceptance checklist

Готово если:
- ads вставляются по правилам placement
- caps работают
- brand safety соблюдается
- ad impressions валидируются
- invalid traffic не засчитывается
- creator revenue базово прозрачен
- unit economics измеримы
- есть kill-switch
- всё соответствует D0.000
