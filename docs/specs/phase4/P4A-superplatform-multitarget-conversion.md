# P4A — Super-platform Expansion Spec (Phase 4)

Дата: 2026-02-22

Статус: Draft (проектирование)

Цель Phase 4: превратить медиа‑платформу в супер‑платформу:
- контент становится входом в сервисы,
- publish работает как платформа multi-target,
- чат — слой конверсии/сделки,
- единые правила trust/visibility/moderation между контентом и сервисами,
- сквозная атрибуция (content→service→chat→deal).

Зависимости:
- Multi-target publish (ядро): [docs/mansoni-platform-implementation-plan-v1.md](docs/mansoni-platform-implementation-plan-v1.md)
- Trust/enforcement: [docs/specs/phase1/P1L-trust-lite-rate-limits-enforcement.md](docs/specs/phase1/P1L-trust-lite-rate-limits-enforcement.md)
- Moderation/surfaces: [docs/specs/phase1/P1K-moderation-queues-sla-appeals-borderline.md](docs/specs/phase1/P1K-moderation-queues-sla-appeals-borderline.md)
- Observability/SLO: [docs/specs/phase0/P0F-observability-slo-killswitch.md](docs/specs/phase0/P0F-observability-slo-killswitch.md)

---

## 0) Ненарушаемые правила

- D0.000: пользователь не должен ощущать “переключение приложения” между контентом/сервисом/чатом.
- Server-side enforcement: видимость/блоки/права сервисов строго сервером.
- Idempotency: каждый conversion action должен быть дедуплицируем.

---

## 1) Business objects как first-class targets

Бизнес-объекты (примерный набор):
- marketplace_product
- real_estate_listing
- insurance_offer
- taxi_trip (или ride_request)
- volunteer_campaign
- channel
- chat_conversation

Каждый объект может:
- быть target публикации
- иметь media attachments
- иметь deep link

---

## 2) Multi-target publish v2 (платформенная шина)

Publish intent создаёт:
- один PublishItem (канонический)
- N PublishTargets

Target types (Phase 4 расширение):
- profile_feed
- reels_feed
- story
- channel
- chat
- marketplace
- realty
- insurance
- taxi
- volunteer

Правило добавления нового target:
- добавляется новый target_type
- ядро publish/ranking не переписывается

---

## 3) Deep links и навигация

Требование:
- любой PublishItem имеет deep link
- любой service target имеет deep link

Пример:
- `mansoni://reel/{publish_item_id}`
- `mansoni://realty/{listing_id}?from=content&content_id=...`

---

## 4) Conversion model (сквозная атрибуция)

### 4.1 Conversion events
События конверсии:
- `content_open_service`
- `service_cta_click`
- `service_lead_created`
- `chat_started_from_service`
- `deal_completed`

Каждое событие включает:
- `content_id`
- `target_type`
- `target_id`
- `session_id/viewer_id`
- `client_event_id` (idempotency)

### 4.2 Attribution rules
- один контент может приводить к нескольким сервисным действиям
- last-touch attribution (baseline)
- multi-touch допускается позже

---

## 5) Chat as conversion layer

### 5.1 Auto-create conversation
Если пользователь нажимает “Связаться”:
- создаётся чат с владельцем объекта
- в чат вставляется rich-card контента + объекта

### 5.2 Safety
- если content/service restricted → карточка не раскрывает детали

---

## 6) Unified trust across services

Trust tier влияет на:
- возможность публиковать сервисный контент
- доступ к лидогенерации
- видимость в сервисных подборках

Низкий trust:
- ограничение reach
- ограничение лидов

---

## 7) Visibility/moderation cross-surface

Правило:
- если PublishItem borderline/red → сервисные surfaces не должны использовать его для продвижения.
- сервисный объект может иметь свой статус, но не может обходить контентные ограничения.

---

## 8) Observability

Метрики:
- `service_conversion_rate_by_surface`
- `chat_initiation_rate_from_content`
- `deal_completion_rate_from_content`
- `fraud_flags_on_conversions`

---

## 9) Kill-switch (Phase 4)

- `disable_service_targets`
- `disable_chat_autocreate`
- `disable_conversion_tracking`

---

## 10) Acceptance checklist

Готово если:
- любой сервисный объект может быть target
- deep links работают
- conversion events идемпотентны
- chat auto-create работает и безопасен
- trust унифицирован
- visibility/moderation не обходятся
- UI соответствует D0.000
