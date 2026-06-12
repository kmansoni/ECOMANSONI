# Reels Engine — P0 Extensions Analysis (2026-02-21)

Контекст: база уже содержит control plane, suppression matrix enforcement, RBAC hardening, action journaling/idempotency (`reels_engine_apply_action`), P0 monitoring RPC (`reels_engine_monitor_snapshot_v1`). DAS worker (`server/reels-arbiter/*`) пока ingestion-only.

Цель этого документа: зафиксировать анализ и предложения по 3 расширениям:
1) Hysteresis на `clear_pipeline_suppression`
2) Config validation перед `activate_config`
3) Lag detection (auto-suppress) на основе мониторинга

---

## 1) Расширение: Hysteresis на clear_suppression

### 1.1 Текущее состояние (факты)
- `reels_engine_segment_state.suppression` хранит JSONB, где pipeline suppression выглядит как:
  - `{ "pipeline": { "suppressed_until": <timestamptz>, "reason": <text> } }`
- `reels_engine_set_pipeline_suppression`:
  - ставит suppression.pipeline
  - переводит `mode = 'incident'`
- `reels_engine_clear_pipeline_suppression`:
  - удаляет suppression.pipeline
  - переводит `mode = 'steady'`
- DAS policy сейчас (см. `server/reels-arbiter/policies/pipelineIntegrity.mjs`):
  - set suppression при `db_error` или `impressionsInWindow < floor`
  - clear suppression при зеленой полосе `greenMinutesToClear`

### 1.2 Почему это проблема
Главный риск — bounce/flapping:
- кратковременное улучшение метрики → clear → проблема возвращается → set → clear...
- churn в `action_journal`, перегрев системы, нестабильность инцидент-режима

### 1.3 Нюансы и edge cases (выжимка)
- DAS может рестартнуть и потерять локальный таймер — значит hysteresis лучше иметь в DB или вычислять из DB.
- `updated_at` не годится как единственный источник истины: обновляется не только suppression.
- `suppressed_until` — TTL, но clear сейчас может происходить до TTL.
- Без явного `set_at` сложно определить «сколько мы уже в инциденте».
- Желательно иметь гистерезис по порогам и/или таймеру: set-порог выше, clear-порог ниже.

### 1.4 Варианты реализации (сравнение)
**A. Новое поле `suppression_set_at` (TIMESTAMPTZ)**
- Плюсы: понятная семантика, легко логировать.
- Минусы: миграция + нужно поддерживать sync с JSON.

**B. Использовать `last_major_action_at` как proxy set-at**
- Плюсы: поле уже есть.
- Минусы: `last_major_action_at` меняется не только suppression-операциями.

**C. Хранить `set_at` внутри JSONB suppression.pipeline**
- Плюсы: вся suppression в одном месте.
- Минусы: надо переписать/обновить все функции чтения/записи suppression.

**D. Новое поле `suppression_clear_eligible_at` (TIMESTAMPTZ)**
- Плюсы: DB может вычислить «когда можно clear» ровно один раз при set.
- Минусы: еще одна колонка, но локально и просто.

**E. Вычислять `set_at` через `action_journal`**
- Плюсы: без новых полей.
- Минусы: join/агрегация, потенциально тяжелее, сложнее поддержка.

### 1.5 Рекомендованный дизайн (P0-safe)
Комбо **D + DAS-side green streak**:
- Добавить в `reels_engine_segment_state` поле:
  - `pipeline_clear_eligible_at TIMESTAMPTZ NULL`
- При `set_pipeline_suppression` (через `reels_engine_apply_action`) устанавливать:
  - `pipeline_clear_eligible_at = now() + interval '<HYSTERESIS_MIN> minutes'`
- При clear:
  - DB проверяет `now() >= pipeline_clear_eligible_at` (иначе отклоняет/возвращает suppressed)
- DAS-side дополнительно сохраняет «зеленую полосу» `greenMinutesToClear` (уже есть).

**Порог по умолчанию** (предложение):
- `HYSTERESIS_MINUTES = 5`
- `GREEN_MINUTES_TO_CLEAR` уже есть в DAS (`REELS_ARB_GREEN_MIN_TO_CLEAR`, default 12)

**Safety valve (опционально)**:
- если suppression длится > 60 минут — можно разрешить clear (но с warning/alert)

### 1.6 Изменения/файлы при внедрении
- Новая supabase migration:
  - `ALTER TABLE reels_engine_segment_state ADD COLUMN pipeline_clear_eligible_at timestamptz` (+ индекс опционально)
  - обновление `reels_engine_apply_action` (ветки set/clear) для записи/проверки eligible_at
- DAS (`pipelineIntegrity.mjs`):
  - clear делаем только если DB позволит (или если local green streak истек)

---

## 2) Расширение: Config validation перед activation

### 2.1 Текущее состояние (факты)
- `reels_engine_propose_config(p_config jsonb, ...)` просто вставляет любой JSONB.
- `reels_engine_activate_config(p_version_id)` просто переключает `is_active` для environment.
- Нет:
  - schema/required fields
  - type checks
  - bounds/constraints
  - size limits
  - cycle detection для `parent_id`

### 2.2 Почему это проблема
- broken config может быть активирован и привести к:
  - падению DAS
  - некорректной оценке/ранжированию
  - неконтролируемым действиям (если в будущем config влияет на action types)

### 2.3 Валидируемые поля (ориентир)
Минимальный набор, который имеет смысл валидировать сейчас (примерно):
- `exploration_ratio` (0..1)
- `recency_days` (1..365)
- `freq_cap_hours` (0..24)
- `algorithm_version` (non-empty)
- веса blending (если вынесены в config): `tiktok_weight`, `instagram_weight`, сумма ≈ 1.0
- опциональные массивы/объекты: `blocked_keywords`, `segment_overrides` — должны иметь ожидаемый тип

### 2.4 Правила валидации (severity)
**CRITICAL (reject activation)**
- exploration_ratio вне [0,1]
- recency_days вне [1,365]
- веса не суммируются в пределах tolerance
- type mismatch: ожидался array/object/number, пришло другое
- config size > лимита (например 500KB)
- циклические parent references (если мы используем parent)

**WARNING (allow, but report)**
- exploration_ratio слишком низкий/высокий
- неизвестные поля (future fields)
- массивы слишком большие (truncate suggestion)

### 2.5 Варианты реализации
**A. Встраивать validation внутрь `activate_config`**
- просто, но хуже UX: нет dry-run.

**B. Отдельная RPC `reels_engine_validate_config(p_version_id uuid)`**
- лучший UX: можно dry-run, получить JSON отчет.
- в `activate_config` validation все равно вызывается как gate.

**C. CHECK constraints / triggers на JSONB**
- сложно, мало гибкости.

### 2.6 Рекомендованный дизайн (P0-safe)
- Добавить функцию:
  - `reels_engine_validate_config_v1(p_version_id uuid) returns jsonb`
  - структура ответа:
    - `{ valid: boolean, errors: [...], warnings: [...], suggestions: [...] }`
- Обновить `reels_engine_activate_config`:
  - вызывает validate
  - если `errors.length > 0` → `RAISE EXCEPTION` и activation не происходит
- Доступ: service_role only (как и propose/activate).

### 2.7 Изменения/файлы при внедрении
- Новая supabase migration:
  - добавить `reels_engine_validate_config_v1`
  - update `reels_engine_activate_config` (gate)
  - (опционально) seed v0 config если нужен baseline

---

## 3) Расширение: Lag Detection (auto-suppress)

### 3.1 Текущее состояние (факты)
- DAS policy сейчас проверяет только `impressionsInWindow` по `created_at`.
- В DB уже есть monitoring RPC `reels_engine_monitor_snapshot_v1(window)`:
  - `event_time_lag_seconds = now() - max(reel_impressions.created_at)`
  - `missing_request_id_rate`

### 3.2 Что именно детектим
**Lag** в P0-терминах = “в системе перестали появляться новые impressions”:
- это operational stall (ingestion/поставка событий), а не «просадка качества».

Важно:
- Текущий lag рассчитывается глобально по таблице (нет `segment_key` в `reel_impressions`).
- Поэтому P0 lag detection будет эффективен в сегменте `global`.

### 3.3 Почему lag detection нужен, если есть floor
- Lag signal не зависит от выбора окна (хотя есть пороги).
- Lag лучше ловит “pipeline dead” даже когда окно/пол неудачно подобраны.
- Lag можно считать на стороне DB и уйти от clock drift worker’а.

### 3.4 Риски ложных срабатываний
- низкий трафик (ночь/тихий период)
- батчевый ingestion (события приходят раз в N минут)
- backfill со старыми `created_at`
- mixed env в одной таблице (если такое случится)

P0 mitigation:
- сделать 2-tier пороги: warn vs suppress
- сочетать с impressions floor (AND/OR по среде)
- использовать hysteresis для clear (см. расширение 1)

### 3.5 Рекомендованный decision policy
- Источник метрики: RPC `reels_engine_monitor_snapshot_v1`.
- Пороговые значения (предложение):
  - `LAG_SUPPRESS_SEC = 600` (10 минут)
  - `LAG_CLEAR_SEC = 120` (2 минуты)
- Green criteria:
  - `impressionsInWindow >= minImpressionsInWindow` AND `lag_seconds <= LAG_CLEAR_SEC`
- set suppression если:
  - db_error OR lag_seconds >= LAG_SUPPRESS_SEC OR floor breached

### 3.6 Идемпотентность / anti-spam
- Ключи idempotency не должны создавать 2 set-операции в минуту для разных причин.
- Предложение:
  - `set` key: sha256(`set|env|segment|minBucket`)
  - `clear` key: sha256(`clear|env|segment|minBucket`)
  - причина (lag/floor/db_error) хранится в journal `reason`, но ключ один.

### 3.7 Изменения/файлы при внедрении
Без миграций БД (P0):
- Изменить DAS policy `pipelineIntegrity.mjs`:
  - добавить RPC вызов `reels_engine_monitor_snapshot_v1`
  - учитывать `event_time_lag_seconds`
- Добавить env vars в `server/reels-arbiter/config.mjs`:
  - `REELS_ARB_LAG_SUPPRESS_SEC`
  - `REELS_ARB_LAG_CLEAR_SEC`
  - (опционально) `REELS_ARB_ENABLE_LAG`

---

## 4) Совместимость с тем, что уже сделано
- Все 3 расширения не ломают existing RPC контракты client-facing.
- Они усиливают P0 safety и совместимы с suppression matrix:
  - set/clear идут через `reels_engine_apply_action` (single decision point)
- Lag detection использует существующий monitoring RPC.

---

## 5) Предлагаемый порядок внедрения (с учетом зависимостей)
1) Hysteresis (чтобы любое auto-clear не flapped)
2) Config validation (чтобы governance/control plane был safe)
3) Lag detection (чтобы DAS мог подавлять pipeline при stall)

---

## 6) Открытые вопросы (нужны от тебя перед внедрением)
1) Hysteresis: предпочитаемый default `HYSTERESIS_MINUTES`? (предложение: 5)
2) Forced clear: нужен ли safety valve (например, 60 минут) или строго запрещаем clear до восстановления?
3) Lag thresholds: `600/120` норм или хочешь агрессивнее/консервативнее?
4) Lag logic: в prod делать `OR` (lag OR floor) или `AND` (lag AND floor) чтобы уменьшить false positives при низком трафике?
