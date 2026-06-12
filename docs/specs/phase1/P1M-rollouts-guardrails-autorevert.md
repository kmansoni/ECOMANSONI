# P1M — Rollouts + Guardrails + Auto-rollback + Kill-switch Coverage Spec (Phase 1 / EPIC M)

Дата: 2026-02-22

Статус: Draft (проектирование)

Цель Phase 1: безопасно экспериментировать с ranking/discovery без релизов и без P0 инцидентов.

Контекст:
- Control-plane конфигов и gate validate/activate уже есть в Supabase migrations (reels_engine_*).
- Phase 0 уже ввёл базовые SLO/kill-switch принципы: [docs/specs/phase0/P0F-observability-slo-killswitch.md](docs/specs/phase0/P0F-observability-slo-killswitch.md)
- Ranking v2 требует авто-rollback: [docs/specs/phase1/P1I-ranking-v2-coldstart-diversity-rollback.md](docs/specs/phase1/P1I-ranking-v2-coldstart-diversity-rollback.md)

---

## 0) Ненарушаемые правила

- Ни один конфиг не раскатывается на 100% без canary.
- Любая активация должна быть аудируема.
- Rollback должен занимать минуты.

---

## 1) Rollout model (фиксировано)

### 1.1 Stages
- 1% (canary) → 10% → 50% → 100%

### 1.2 Минимальная длительность стадии
- 1%: минимум 30 минут
- 10%: минимум 2 часа
- 50%: минимум 6 часов

### 1.3 Stop conditions
- любое нарушение guardrails → стоп и rollback

---

## 2) Guardrails (фиксировано, численно)

Phase 1 guardrails измеряются по сравнению с baseline (предыдущая активная версия):

- `report_rate_per_1k_impressions`:
  - не более +20%

- `hide_rate_per_1k_impressions`:
  - не более +20%

- `feed_page_latency_ms P95`:
  - не более +30%

- `playback_start_failure_rate`:
  - не более +30%

- `empty_first_page_rate`:
  - не более +2% absolute

---

## 3) Auto-rollback policy

### 3.1 Trigger
Если guardrail нарушен на любой стадии →
- rollback на предыдущий active config
- включение kill-switch режима при необходимости

### 3.2 Rollback modes
- `rollback_config_only`
- `rollback_and_force_fallback_recency`

---

## 4) Kill-switch coverage (Phase 1 расширение)

### 4.1 Ranking
- `ranker_off_recency_on`

### 4.2 Discovery
- `disable_explore`
- `disable_trends`

### 4.3 Safety
- `strict_safety_mode`:
  - исключить borderline + усилить safety penalties

### 4.4 Create
- `disable_reel_publish`

---

## 5) Experiment journal (обязательный артефакт)

Каждая активация создаёт запись:
- кто активировал
- версия конфига
- сегмент
- rollout stage
- baseline version
- guardrail snapshot
- итог: continued/rolled back

---

## 6) Admin/QA UX (D0.000)

Если админка доступна внутри продукта:
- все страницы rollout/guardrails в вашем стиле
- никаких внешних “сырьевых” панелей

---

## 7) Acceptance checklist

Готово если:
- canary stages определены
- guardrails численные
- auto-rollback описан
- kill-switch coverage расширен
- experiment journal обязателен
- UX соответствует D0.000
