# P1H — Hashtags + Trends Spec (Phase 1 / EPIC H)

Дата: 2026-02-22

Статус: Draft (проектирование)

Цель: построить discovery‑контур (хештеги/тренды) так, чтобы:
- контент находился вне ленты,
- тренды отражали реальную популярность, а не накрутку,
- хештеги были модерационно контролируемы,
- всё работало в рамках trust-lite и rate limits.

Входные спеки:
- Trust-lite/enforcement: [docs/specs/phase1/P1L-trust-lite-rate-limits-enforcement.md](docs/specs/phase1/P1L-trust-lite-rate-limits-enforcement.md)
- Moderation v1: [docs/specs/phase1/P1K-moderation-queues-sla-appeals-borderline.md](docs/specs/phase1/P1K-moderation-queues-sla-appeals-borderline.md)
- Ranking v2 (trending pool требования): [docs/specs/phase1/P1I-ranking-v2-coldstart-diversity-rollback.md](docs/specs/phase1/P1I-ranking-v2-coldstart-diversity-rollback.md)

---

## 0) Ненарушаемые правила

- Borderline/red контент не участвует в трендах.
- Trust-weighted: сигналы низкого trust не могут “вынести” тренд.
- Anti-hijack: stuffing и нерелевантное присваивание тегов должны штрафоваться.
- D0.000: UI страниц тегов/трендов использует ваши карточки и панели.

---

## 1) Hashtag model (канонизация)

### 1.1 Canonical form
Правило канонизации:
- lowercase
- Unicode normalize (NFKC)
- удалить ведущий `#`
- заменить множественные пробелы/разделители

Ограничения:
- длина 2..32 символа
- допускаются буквы/цифры/подчёркивание

### 1.2 Hashtag stuffing limits
- max hashtags per reel: 5 (Phase 1)
- если >5 →
  - лишние игнорируются
  - применяется `hashtag_stuffing_penalty` в ranking/discovery

---

## 2) Hashtag surfaces (UX контракт)

Страница тега содержит:
- Top (смешанный)
- Recent
- Trending
- Related tags

Правило:
- выдача на странице тега уважает moderation surface matrix.

---

## 3) Hashtag moderation

Теги имеют статус:
- `normal`
- `restricted` (не показывается в discovery, но может существовать по прямому вводу)
- `hidden` (не показывается и не используется)

Причины:
- hate/harassment
- illegal
- nsfw
- spam

---

## 4) Trend engine (Phase 1)

### 4.1 Trend signal inputs
Для item/тега/аудио считаем:
- velocity impressions/views (nearline)
- velocity watched/completion
- unique viewers
- unique creators
- share/save rate
- report/hide rate

### 4.2 Trust-weighting
- сигналы от low-trust tiers снижают вклад
- сигналы от подозрительных сессий игнорируются

### 4.3 Trend eligibility gates
Трендом может быть только контент:
- green distribution
- report_rate < threshold
- достаточный unique viewers/creators

### 4.4 Trend decay
Тренд имеет:
- peak
- decay curve
- max lifetime (например 48–72 часа)

---

## 5) Anti-hijack и anti-manipulation

### 5.1 Relevance gate (Phase 1 heuristic)
Если reel использует популярный тег, но:
- нет коррелирующих сигналов (например текст/описание/категория)
→ снижать вероятность попадания в top/trending.

### 5.2 Coordinated attack guard
Если velocity растёт:
- из коррелированной группы аккаунтов
- с одинаковыми паттернами
→ помечаем anomaly и исключаем из трендов до review.

### 5.3 Reporter abuse integration
Mass-report attacks не должны:
- автоматически выкидывать конкурента из трендов без review.

---

## 6) Rate limits integration (обязательное)

Лимиты из P1L применяются к:
- созданию новых тегов
- частоте изменения тегов
- поисковым запросам

---

## 7) Observability

Метрики:
- `hashtag_click_rate`
- `hashtag_watch_rate`
- `trend_anomaly_flag_rate`
- `hashtag_hidden_rate`
- `stuffing_penalty_rate`

---

## 8) Acceptance checklist

Готово если:
- канонизация стабильна
- stuffing ограничен
- тренды trust-weighted
- borderline/red не в трендах
- есть decay
- hijack атаки детектятся
- UI в D0.000
