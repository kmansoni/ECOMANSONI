# P0F — Observability + SLO + Kill-switch + Incident Response Spec (Phase 0 / EPIC F)

Дата: 2026-02-22

Статус: Draft (проектирование)

Цель: сделать Phase 0 операционно управляемым:
- измеримость (метрики/логи/трейсы) по ключевым контурам,
- численные SLO/пороги,
- kill-switch механики для деградации без падения,
- процесс инцидентов P0–P3 с postmortem.

Связанные спеки Phase 0:
- Feed contract: [docs/specs/phase0/P0A-reels-feed-contract.md](docs/specs/phase0/P0A-reels-feed-contract.md)
- Event integrity: [docs/specs/phase0/P0B-playback-event-integrity.md](docs/specs/phase0/P0B-playback-event-integrity.md)
- Create reels: [docs/specs/phase0/P0C-create-reels-upload-publish.md](docs/specs/phase0/P0C-create-reels-upload-publish.md)
- Ranking baseline: [docs/specs/phase0/P0D-ranking-baseline-v1.md](docs/specs/phase0/P0D-ranking-baseline-v1.md)
- Moderation gate: [docs/specs/phase0/P0E-moderation-gate-minimal.md](docs/specs/phase0/P0E-moderation-gate-minimal.md)

---

## 0) Ненарушаемые правила

- **No blind ops**: фича не считается “готовой”, если нельзя понять, что она сломалась.
- **D0.000**: любые пользовательские сообщения о деградации/ошибках — в вашем стиле.
- **Server-side truth**: приватность/блокировки/модерация и ключевые counters — серверные.

---

## 1) SLO (численные цели Phase 0)

Цели Phase 0 должны быть реалистичны для early-stage инфраструктуры и Supabase.

### 1.1 Feed SLO
- `feed_page_latency_ms`:
  - P50 ≤ 250ms
  - P95 ≤ 800ms
- `feed_error_rate` (5xx + “RPC failed”): ≤ 0.5% за 15 минут
- `empty_first_page_rate`: ≤ 1% (если выше — обязателен fallback)

### 1.2 Playback SLO
- `playback_start_failure_rate`: ≤ 1% за 15 минут
- `first_frame_time_ms`:
  - P50 ≤ 400ms
  - P95 ≤ 1200ms
- `rebuffer_rate` (если измеряется): ≤ 5% сессий

### 1.3 Event Integrity SLO
- `invalid_sequence_reject_rate`: ≤ 0.2% событий
- `event_dedup_hit_rate`: ожидаемо > 0 (ретраи), но:
  - если > 20% — признак сетевых проблем/ошибок клиента

### 1.4 Create Reels SLO
- `create_reel_success_rate`: ≥ 97% (без учёта пользовательских validation reject)
- `upload_success_rate`: ≥ 98%
- `publish_idempotency_collision_rate`: >0 допустимо, но:
  - `duplicate_reels_created` целевое значение = 0

### 1.5 Moderation SLO (Phase 0 минимально)
- `blocked_content_leak_rate`: ≈ 0

---

## 2) Метрики (обязательный минимальный набор)

### 2.1 Feed
- `feed_page_latency_ms`
- `feed_error_rate`
- `fallback_activation_rate` (строго по mode: `fallback_recency`, `fallback_no_freqcap`)
- `duplicate_suppression_rate`

### 2.2 Playback
- `first_frame_time_ms`
- `playback_start_failure_rate`
- `view_start_to_viewed_ratio`
- `viewed_to_watched_ratio`

### 2.3 Events
- `event_dedup_hit_rate`
- `invalid_sequence_reject_rate`

### 2.4 Create
- `create_reel_attempts`
- `create_reel_success`
- `create_reel_failure_by_code`
- `upload_latency_ms`

### 2.5 Ranking/Safety
- `report_rate_per_1k_impressions`
- `hide_rate_per_1k_impressions`
- `creator_diversity_index`

---

## 3) Structured logging (минимальный стандарт)

Каждый серверный write/read, влияющий на продуктовые метрики, логирует:
- `trace_id` (сквозной)
- `request_id` (feed)
- `algorithm_version`
- `viewer_id` **или** `session_id`
- `reel_id` (если применимо)
- `event_type`/`error_code` (stable taxonomy)

Запрещено:
- логировать приватные payloads/PII без маскирования.

---

## 4) Tracing (сквозной путь)

Минимальные цепочки трассировки:
- Feed request → get_reels_feed_v2 → response
- Impression event → record_impression RPC
- Create reels: upload → public URL → insert/upsert reel → feed appears

Требование:
- `request_id` с feed всегда пробрасывается в event RPC.

---

## 5) Alerting (категории + пороги)

### 5.1 Feed alerts
- Critical (P0): `feed_error_rate` > 2% в течение 5 минут
- Warning (P1): `feed_page_latency_ms P95` > 1500ms в течение 10 минут
- Warning (P1): `empty_first_page_rate` > 3% в течение 10 минут

### 5.2 Playback alerts
- Critical (P0): `playback_start_failure_rate` > 3% / 5 минут
- Warning (P1): `first_frame_time_ms P95` > 2000ms / 10 минут

### 5.3 Events alerts
- Warning (P1): `invalid_sequence_reject_rate` > 1% / 10 минут
- Warning (P1): `event_dedup_hit_rate` > 30% / 10 минут

### 5.4 Safety alerts
- Warning (P1): `report_rate_per_1k_impressions` > baseline + threshold (настроить позже)

---

## 6) Kill-switch каталог (Phase 0)

Kill-switch — это **управляемая деградация**, не “выключить всё”.

### 6.1 Ranking kill-switch
Режимы:
- `ranker_off_recency_on`:
  - выключить scoring,
  - оставить recency pool + safety filters,
  - включить более жёсткий dedup.

Триггеры:
- ranker timeout / feed latency spike.

### 6.2 Fallback усиление
- `force_fallback_recency`:
  - всегда использовать fallback на первой странице.

Триггеры:
- empty_first_page_rate spike.

### 6.3 Create kill-switch
- `disable_reel_publish`:
  - запретить публикацию reels (только просмотр),
  - UI показывает нейтральное сообщение.

Триггеры:
- массовые ошибки upload/publish.

### 6.4 Events kill-switch
- `events_sampling_high`:
  - снизить частоту high‑volume событий (например impression) при сохранении integrity.

Триггеры:
- перегрузка write-path.

---

## 7) Incident response (P0–P3)

### 7.1 Severity
- P0: продукт недоступен/массовая деградация (feed/плеер не работает)
- P1: критическая деградация метрик (latency/errors) без полного outage
- P2: частичная деградация (один регион/одна функция)
- P3: minor баги

### 7.2 Стандартный runbook (минимум)
1) Определить домен: feed/playback/events/create/safety
2) Проверить метрики + последние deploy/config changes
3) Активировать kill-switch (если нужно)
4) Стабилизировать (fallback/disable publish)
5) Собрать данные (request_id, algorithm_version, error_code)
6) Зафиксировать timeline

### 7.3 Postmortem (обязателен для P0/P1)
Шаблон:
- What happened?
- Impact
- Root cause
- Detection
- Mitigation
- Prevention tasks (owner + due date)

---

## 8) Cost observability (Phase 0 минимум)

Отслеживать ежедневно:
- storage growth по bucket’ам
- egress (если доступно)
- количество uploads

Политика:
- если storage растёт быстрее baseline → вводить квоты (готовится Phase 1/2).

---

## 9) Acceptance checklist

EPIC F считается готовым, если:
- SLO зафиксированы численно.
- Метрики/логи/трейсы имеют минимальные поля корреляции.
- Есть alerting пороги.
- Есть kill-switch каталог с деградационными режимами.
- Есть incident runbook + postmortem шаблон.
- Любая деградация UX соответствует D0.000.
