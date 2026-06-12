# P0E — Minimal Moderation Gate Spec (Phase 0 / EPIC E)

Дата: 2026-02-22

Статус: Draft (проектирование)

Цель Phase 0:
- гарантировать, что **blocked** контент не появляется в:
  - Reels feed
  - Explore/рекомендациях
  - share карточках (если нет прав)
- заложить основу для Phase 1 moderation queue/SLA/appeals.

Контекст репо:
- В запросах к `reels` уже фигурирует `moderation_status != blocked` как фильтр в fallback-режимах (см. useReels).

---

## 0) Ненарушаемые правила

- Server-side enforcement: фильтр модерации применяется в SQL/RPC.
- D0.000: пользовательские уведомления нейтральны и в вашем стиле.
- Observability: любое ограничение должно иметь reason-code.

---

## 1) Статусы модерации (Phase 0 фиксировано)

Решение Phase 0 вводит минимальный набор:
- `allowed`
- `blocked`

Переходы:
- allowed → blocked (по админскому действию или автоматике)
- blocked → allowed (только админ, с аудитом)

Phase 0 не вводит полноценный `needs_review` как обязательный (это Phase 1), но допускает его как внутренний статус без участия в рекомендациях.

---

## 2) Surface Matrix (куда может попадать контент)

Поверхности:
- S1: Reels feed (рекомендации)
- S2: Profile grid (автор видит свои ролики)
- S3: Direct link/open by id
- S4: Share card (в чат/канал)
- S5: Explore (Phase 1)

Правила Phase 0:

### 2.1 Allowed
- S1: ✅ да
- S2: ✅ да
- S3: ✅ да
- S4: ✅ да (в пределах visibility/blocks)
- S5: ✅ да (Phase 1)

### 2.2 Blocked
- S1: ❌ нет
- S2: ✅ да, но только владельцу (и admin)
- S3: ❌ нет (для обычных пользователей)
- S4: ❌ нет (карточка не раскрывает контент)
- S5: ❌ нет

---

## 3) Negative-signal integration

Если item получает массовые репорты:
- Phase 0: допускается ручной блок.
- Phase 1: вводится auto‑restrict/needs_review.

В Phase 0 важно:
- report/hide не должны автоматически блокировать контент без политики.

---

## 4) Admin actions (минимум Phase 0)

Действия:
- block item
- unblock item

Требования:
- каждое действие пишет audit entry (кто/когда/почему).
- reason-code обязателен (категория: spam/nsfw/violence/copyright/other).

---

## 5) User-facing UX (D0.000)

Если контент заблокирован:
- автор видит нейтральную метку “Ограничено” + ссылка “Подробнее” (в будущем).
- зрители:
  - не видят контент в ленте
  - при открытии ссылки видят нейтральное сообщение “Недоступно”.

Никаких красных экранов/паники.

---

## 6) Observability

Метрики:
- `blocked_content_leak_rate` (целевое значение ~0)
- `admin_block_actions_count`
- `admin_unblock_actions_count`
- `report_rate_per_1k_impressions` (как сигнал нагрузки на модерацию)

---

## 7) Acceptance tests

T1: blocked не в выдаче
- пометить ролик blocked
- убедиться, что он не возвращается в feed

T2: blocked не шарится
- попытка share в чат
- карточка не раскрывает контент

T3: автор видит свой blocked
- в профиле автор видит статус

---

## 8) Решения Phase 0 (без открытых вопросов)

- Phase 0: только `allowed/blocked` как обязательные статусы.
- Blocked никогда не участвует в рекомендациях/шэринге.
- Админские действия аудируются и имеют reason-code.
