# P1I — Ranking v2 Spec (Cold Start + Diversity + Negative Feedback + Anti-feedback-loop + Rollback)

Дата: 2026-02-22

Статус: Draft (проектирование)

Цель Phase 1:
- улучшить удержание и качество выдачи без токсичности,
- дать новым авторам шанс,
- сделать “не интересно” реально работающим,
- защититься от эхо‑камеры и controversial amplification,
- управлять всем через Reels Engine config gate (validate/activate + сегменты).

Входные спецификации:
- Phase 0 ranking baseline: [docs/specs/phase0/P0D-ranking-baseline-v1.md](docs/specs/phase0/P0D-ranking-baseline-v1.md)
- Phase 0 events: [docs/specs/phase0/P0B-playback-event-integrity.md](docs/specs/phase0/P0B-playback-event-integrity.md)
- Trust/enforcement: [docs/specs/phase1/P1L-trust-lite-rate-limits-enforcement.md](docs/specs/phase1/P1L-trust-lite-rate-limits-enforcement.md)
- Moderation policy: [docs/specs/phase1/P1K-moderation-queues-sla-appeals-borderline.md](docs/specs/phase1/P1K-moderation-queues-sla-appeals-borderline.md)
- Phase 0 observability/kill-switch: [docs/specs/phase0/P0F-observability-slo-killswitch.md](docs/specs/phase0/P0F-observability-slo-killswitch.md)

---

## 0) Ненарушаемые правила

- Любые коэффициенты/пороги → конфиг (control-plane) + gate.
- Borderline не попадает в рекомендации/тренды.
- Trust-weighted signals: низкий trust не должен рулить трендами.
- Explainability: reason codes обязательны.

---

## 1) Candidate generation v2 (источники + квоты)

Источники кандидатов (фиксировано):

1) **Following pool**
- контент от авторов, на которых подписан viewer.

2) **Interest pool**
- контент, похожий по темам/авторам на позитивные сигналы viewer.
- Phase 1 допускает heuristic similarity (без heavy ML), но контракт готов к embeddings.

3) **Trending pool (trust-weighted)**
- тренды по velocity + уникальные пользователи + trust‑weighted engagement.

4) **Fresh creators pool**
- новые авторы/новые ролики с минимальным показом.

5) **Safety/coldstart safe pool**
- безопасный контент для новых пользователей.

Квоты (в конфиге):
- `exploration_ratio`
- `following_ratio`
- `fresh_creator_ratio`
- `trending_ratio`

Правило перераспределения:
- если источник пуст → его квота перераспределяется в recency/safe.

---

## 2) Scoring v2 (multi-objective)

Скоринг строится как сумма целей + штрафы + нормализация:

$$
score = \sum_i w_i \cdot objective_i - \sum_j p_j \cdot penalty_j
$$

Objectives (минимум Phase 1):
- `watch_time_proxy`
- `completion_proxy`
- `save_rate`
- `share_rate`
- `follow_intent_proxy` (например click-to-profile/follow)

Penalties (минимум Phase 1):
- `report_rate_penalty`
- `hide_penalty`
- `not_interested_penalty`
- `repeat_penalty`
- `author_fatigue_penalty`
- `controversial_penalty` (см. раздел 6)

Нормализация:
- objective значения приводятся к [0..1] по cohort/сегменту.

Trust-weighting:
- engagement сигналы от низких tiers (Tier D) получают понижающий вес.

---

## 3) Diversity constraints v2

Окна и ограничения (в конфиге):

- `max_items_per_author_in_window` (например 2 в последних 10)
- `min_unique_authors_in_window` (например 6 в последних 10)
- `min_unique_topics_in_window` (если темы доступны; иначе — proxy)

Дополнительно:
- “новые авторы” должны появляться минимум N раз за сессию (если есть кандидаты).

---

## 4) Negative feedback propagation (сила сигнала)

События:
- not_interested
- hide
- report

Правила Phase 1:

### 4.1 Item-level suppression
- item исключается из выдачи на T дней (конфиг).

### 4.2 Author-level soft suppression
- мягкий штраф автору на T дней.

### 4.3 Similarity-level suppression
- если есть topic/audio/text сигналы → штраф похожим.
- если нет → Phase 1 ограничивается author-level.

---

## 5) Cold start стратегия

Сегменты cold start:
- `new_user` (нет истории)
- `returning_low_signal` (история есть, но мало)

Режим:
- высокий diversity,
- высокий safety weight,
- exploration выше,
- исключить borderline.

Цель:
- собрать быстрые сигналы за первые 20–50 impressions.

---

## 6) Anti-feedback-loop и controversial amplification guardrail

Это обязательный блок Phase 1.

### 6.1 Echo chamber limiter
Если viewer потребляет одну тему/одного автора непропорционально:
- увеличиваем exploration ratio,
- усиливаем diversity constraints,
- добавляем safe pool.

### 6.2 Controversial penalty
Если item имеет одновременно:
- высокий engagement velocity
- высокий report/hide rate

→ item не должен усиливаться как trending.

Реакция:
- штраф `controversial_penalty`
- исключение из trending pool
- возможная отправка в needs_review (mod queue)

---

## 7) Explainability v2 (reason codes)

Каждый item получает:
- `source_pool` (following/interest/trending/fresh/safe)
- `boosts[]` (freshness/diversity)
- `penalties[]` (repeat/author_fatigue/safety/controversial)

В Phase 1 user‑UI показывает только краткие категории.
Admin/QA может видеть расширенную панель.

---

## 8) Guardrails + Auto-rollback (обязательное)

Rollout всегда canary:
- 1% → 10% → 50% → 100%

Guardrails (пример baseline порогов; в конфиге/ops):
- report_rate_per_1k_impressions не должен вырасти > +20% от baseline
- feed latency P95 не должен вырасти > +30%
- playback start failure не должен вырасти > +30%

Если нарушено:
- автоматический rollback на предыдущую активную конфигурацию
- включение `ranker_off_recency_on` kill-switch при необходимости

---

## 9) Config schema (Phase 1 расширение)

Требование: все новые параметры должны:
- проходить `reels_engine_validate_config_v1`
- быть безопасны по умолчанию
- поддерживать unknown keys warnings

Минимальный набор новых ключей:
- `following_ratio`, `fresh_creator_ratio`, `trending_ratio`
- `max_items_per_author_in_window`, `min_unique_authors_in_window`
- `suppression_days_item`, `suppression_days_author`
- `controversial_thresholds` (report/hide)

---

## 10) Метрики качества ранжирования (Phase 1)

- retention D1/D7 (по сегментам)
- session duration
- completion proxy
- save/share per 1k impressions
- report/hide per 1k impressions
- creator diversity index
- new creator exposure rate

---

## 11) Acceptance checklist

Готово если:
- есть источники кандидатов + квоты
- есть multi-objective scoring (objectives+penalties)
- есть diversity constraints
- negative feedback реально меняет выдачу
- cold start режим существует
- anti-feedback-loop и controversial guardrail работают
- reason codes v2 доступны
- rollout + guardrails + auto-rollback включены
