# P1J — Creator Analytics v1 Spec (Phase 1 / EPIC J)

Дата: 2026-02-22

Статус: Draft (проектирование)

Цель: дать создателю понятные метрики и инсайты, которые реально улучшают контент и повышают creator return rate.

Ключевой принцип: аналитика должна опираться только на события, прошедшие Event Integrity.

Входные спеки:
- Event integrity: [docs/specs/phase0/P0B-playback-event-integrity.md](docs/specs/phase0/P0B-playback-event-integrity.md)
- Feed contract (request_id/algorithm_version): [docs/specs/phase0/P0A-reels-feed-contract.md](docs/specs/phase0/P0A-reels-feed-contract.md)
- Ranking v2 (reason codes): [docs/specs/phase1/P1I-ranking-v2-coldstart-diversity-rollback.md](docs/specs/phase1/P1I-ranking-v2-coldstart-diversity-rollback.md)
- Trust/moderation (что скрывать/ограничивать): [docs/specs/phase1/P1K-moderation-queues-sla-appeals-borderline.md](docs/specs/phase1/P1K-moderation-queues-sla-appeals-borderline.md)

---

## 0) Ненарушаемые правила

- D0.000: analytics UI — продуктовый экран в вашем стиле, не “сырой BI”.
- Privacy: показываем только метрики по собственному контенту автора.
- Integrity: считаем метрики только по валидным событиям.

---

## 1) Какие метрики считаются “истиной” (Phase 1)

Для Phase 1 берём минимум, который можно доверять:

### 1.1 Reach
- `impressions` (по правилам impression)
- `unique_viewers` (если есть)

### 1.2 Watch quality
- `view_starts`
- `viewed_2s`
- `watched` (Phase 0 правило)
- `watched_rate = watched / view_starts`
- `avg_watch_seconds` (если можно измерять)

### 1.3 Satisfaction
- `likes`
- `comments`
- `saves`
- `shares`

### 1.4 Negative/safety
- `hides`
- `not_interested`
- `reports`

### 1.5 Distribution breakdown
- by `source_pool`/reason codes:
  - following
  - explore
  - trending
  - fresh
  - safe

---

## 2) Витрины (агрегаты) Phase 1

Создателю нужны 2 уровня:

### 2.1 Per-reel metrics
- окно 24h/7d/30d
- snapshots по дням

### 2.2 Creator dashboard
- суммарные метрики по всем роликам
- рост аудитории (если есть follows)

Важно:
- nearline агрегаты обновляются “раз в N минут/час”
- показываем timestamp “обновлено …”

---

## 3) Creator Insights (инсайты, которые реально помогают)

Phase 1 вводит минимум инсайтов (без ML магии):

### 3.1 Retention hint
Если `watched_rate` ниже порога → подсказка:
- “Слабое удержание в первые 2 секунды”

### 3.2 Hook hint
Если `view_starts/impressions` низкий →
- “Первые кадры/обложка не цепляют”

### 3.3 Safety warning
Если `reports` выше baseline →
- “Контент получает жалобы — может быть ограничен”

Все подсказки:
- нейтральны
- не раскрывают внутренние веса алгоритма

---

## 4) UX контракт (D0.000)

Экраны:
- Creator Dashboard (обзор)
- Reel Insights (детально)

UI элементы:
- glass cards
- violet accents на ключевых метриках
- простые графики (без перегруза)

Ошибки/empty:
- нейтральные, в едином стиле

---

## 5) Observability и integrity

Метрики корректности аналитики:
- расхождение `sum(per-reel)` vs `creator_total` не превышает малый порог
- anomaly: резкий скачок likes без корреляции view_starts

---

## 6) Acceptance checklist

Готово если:
- per-reel и creator dashboard есть
- метрики берутся только из валидных событий
- breakdown по source/reason codes доступен
- инсайты минимальны, но actionable
- UI соответствует D0.000
