# P1G — Explore/Discovery Surface Spec (Phase 1 / EPIC G)

Дата: 2026-02-22

Статус: Draft (проектирование)

Цель: создать отдельную surface “Explore”, которая:
- даёт pull‑исследование,
- не дублирует Reels feed,
- использует тренды/теги/новых авторов,
- уважает trust/moderation/visibility,
- измерима и управляемая.

Входные спеки:
- Ranking v2: [docs/specs/phase1/P1I-ranking-v2-coldstart-diversity-rollback.md](docs/specs/phase1/P1I-ranking-v2-coldstart-diversity-rollback.md)
- Hashtags/Trends: [docs/specs/phase1/P1H-hashtags-trends-discovery-integrity.md](docs/specs/phase1/P1H-hashtags-trends-discovery-integrity.md)
- Moderation: [docs/specs/phase1/P1K-moderation-queues-sla-appeals-borderline.md](docs/specs/phase1/P1K-moderation-queues-sla-appeals-borderline.md)
- Trust-lite: [docs/specs/phase1/P1L-trust-lite-rate-limits-enforcement.md](docs/specs/phase1/P1L-trust-lite-rate-limits-enforcement.md)

---

## 0) Ненарушаемые правила

- D0.000: Explore UI использует существующие карточки/панели, без новой темы.
- Borderline/red не показываются.
- Trust-weighted: low-trust сигналы не доминируют подборки.

---

## 1) Explore layout (UX контракт)

Explore состоит из секций:
- Trending now (локаль/регион)
- Hashtags
- Fresh creators
- Categories (topic clusters)
- Recommended reels grid (preview)

Правило:
- Explore кликается в полноэкранный Reels player как обычно.

---

## 2) Explore ranking (отличия от feed)

Explore в отличие от feed:
- меньше персонализации в начале
- больше diversity
- больше свежего

Источники:
- trending pool
- hashtag pages top
- fresh creators pool
- safe pool

---

## 3) Caching & performance

Минимальные требования:
- кеш секций Explore на короткий TTL (например 60–180 сек)
- если зависимость недоступна → деградация на recency безопасный список

---

## 4) Safety enforcement

Explore использует surface matrix:
- только green content
- исключает авторов/контент по блокировкам

---

## 5) Metrics

- `explore_open_rate`
- `explore_to_watch_rate`
- `explore_session_length`
- `explore_section_click_distribution`

---

## 6) Acceptance checklist

Готово если:
- есть секции
- выдача стабильна
- safety enforced
- кеширование снижает нагрузку
- метрики есть
- UI соответствует D0.000
