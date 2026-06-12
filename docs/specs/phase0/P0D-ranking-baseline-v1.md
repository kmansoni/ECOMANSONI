# P0D — Ranking Baseline v1 Spec (Phase 0 / EPIC D)

Дата: 2026-02-22

Статус: Draft (проектирование)

Цель: формализовать baseline ранжирование Reels так, чтобы оно:
- давало хорошее ощущение TikTok‑ленты (freshness + интересы),
- было управляемо через существующий control-plane конфигов,
- было дебажимо (reason-codes + request_id),
- было безопасно (moderation/blocks),
- имело fallback.

Связь с репо:
- Выдача уже возвращает `final_score`, `recommendation_reason`, `algorithm_version`, `request_id`: см. [supabase/migrations/20260221143000_get_reels_feed_v2_fallback_and_visibility.sql](supabase/migrations/20260221143000_get_reels_feed_v2_fallback_and_visibility.sql)
- Control-plane конфигов + gate validate/activate уже есть: см. migrations `reels_engine_*` и тесты `reels-config-validate-v1.test.ts`.
- События просмотра (impression/viewed/watched/skip/feedback) уже пишутся через RPC из [src/hooks/useReels.tsx](src/hooks/useReels.tsx).

---

## 0) Ненарушаемые правила

- Вся логика коэффициентов → **только** через конфиг (никаких “тайных” значений в коде).
- Любая смена конфигурации → validate → activate gate.
- Любая выдача → stamped `algorithm_version` + `request_id` + reason-codes.
- Phase 0 recommendations = только `public` items (см. P0A).

---

## 1) Data model требований к сигналам

### 1.1 Online signals (минуты/часы)
Используются для адаптации выдачи в сессии:
- последние negative feedback (not_interested/hide/report)
- недавние авторы, которых пользователь “досматривал”

### 1.2 Nearline signals (час/день)
Используются как стабильные агрегаты:
- impressions/views/watched/completion proxy
- saves/shares
- report/hide rates

### 1.3 Offline signals (периодические)
Используются позже (Phase 1+), но контракт закладываем:
- topic embeddings
- аудио/текст классификация
- кластеры похожих роликов

---

## 2) Candidate Generation (Phase 0)

Источники кандидатов (фиксировано):
1) **Recency pool**: новые public reels по времени.
2) **Engagement pool**: public reels с хорошими nearline сигналами (watch/saves/shares) при низких report/hide.
3) **Explore pool** (минимальный): лёгкая персонализация на основе простых сигналов (например, авторы/темы если уже есть).

Квоты (в конфиге):
- `exploration_ratio` (у вас уже есть в validate config)
- остальное распределяется между recency/engagement.

Fallback:
- если кандидатный пул пуст → recency pool (без опасных ослаблений безопасности).

---

## 3) Multi-objective scoring (формально)

Для каждого кандидата вычисляется score:

$$
score = w_fresh \cdot Freshness + w_watch \cdot WatchProxy + w_save \cdot SaveRate + w_share \cdot ShareRate + w_neg \cdot NegativePenalty + w_safe \cdot SafetyPenalty
$$

Где:
- `Freshness` — убывающая функция времени с момента публикации
- `WatchProxy` — агрегат (viewed/watched/completion proxy)
- `SaveRate/ShareRate` — nearline нормы
- `NegativePenalty` — штрафы за user feedback (not_interested/hide)
- `SafetyPenalty` — штрафы за report rate / borderline / moderation flags

Требования:
- веса `w_*` конфигурируются
- сумма весов нормируется (и валидируется в gate)
- penalties не могут быть отрицательными (чтобы не усиливать токсичный контент)

---

## 4) Re-ranking constraints (Phase 0)

Обязательные ограничения:

### 4.1 No-repeat window
- item не может появиться повторно в окне `dedup_window` (см. P0A).

### 4.2 Author cap
- не более `max_items_per_author_in_window` в окне `M`.

### 4.3 Negative feedback suppression
- если пользователь дал `not_interested` по item →
  - исключить item из будущих кандидатов на T дней
  - применить мягкий штраф к “похожим” (в Phase 0: хотя бы к тому же автору)

### 4.4 Safety gate
- `blocked` исключается всегда
- high report rate → penalty/исключение (порог в конфиге)

---

## 5) Explainability / reason-codes

Каждый item в выдаче получает:
- `recommendation_reason` (строка/код)
- опционально `reason_details` (для admin/QA)

Минимальный набор reason-codes Phase 0:
- `recency_new`
- `engagement_high`
- `explore_mix`
- `fallback_recency`
- `fallback_no_freqcap`

Правило:
- reason-code должен соответствовать реальному источнику кандидата или fallback mode.

---

## 6) Guardrails + rollback (Phase 0)

Phase 0: guardrails фиксируются как требования, даже если ручной процесс:
- если `report_rate_per_1k_impressions` превышает порог →
  - уменьшить exploration
  - усилить safety penalty
  - включить safe-mode (fallback)

В Phase 1 это становится auto-rollback.

---

## 7) Failure modes (Phase 0 каталог)

FM1: недостаток кандидатов → пустая страница
- решение: fallback recency

FM2: повторяемость контента
- решение: dedup window + author cap

FM3: усиление токсичного контента
- решение: safety penalty + borderline исключение

FM4: накрутка событий
- решение: event integrity (P0B) + trust-lite (Phase 1)

---

## 8) Acceptance tests

T1: diversity
- в окне 10 items не больше X от одного автора

T2: negative feedback
- not_interested на ролик → ролик не появляется снова

T3: safety
- blocked ролик не появляется

---

## 9) Решения Phase 0 (без открытых вопросов)

- Веса scoring настраиваются конфигом.
- Reason-codes обязательны и стабильны.
- Любая персонализация в Phase 0 минимальна и не требует offline ML.
