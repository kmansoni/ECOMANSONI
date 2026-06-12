# Phase 0 — Core MVP Execution Plan (Tracker-ready, no code)

Дата: 2026-02-22

Оценка длительности: 8–12 недель (см. [docs/phases-overview-roadmap.md](docs/phases-overview-roadmap.md))

Назначение: дать **исполняемый** план (эпики → задачи → зависимости → DoD/метрики) для запуска Core MVP супер‑платформы в текущем репозитории.

Ограничения:
- **Без кода** (только план/артефакты/контракты/DoD).
- **D0.000**: все UI элементы строго в вашей дизайн‑системе (dark/navy + violet accents + glass, единые отступы/радиусы, safe-area/100dvh, единый UI‑движок).
- **Server-side enforcement**: приватность/блокировки/доступы — на сервере.
- **Idempotency everywhere**: переносим proven‑паттерн из чата на upload/publish/events.

Связанный документ: [docs/mansoni-platform-implementation-plan-v1.md](docs/mansoni-platform-implementation-plan-v1.md)

---

## 0) Что считается “Core MVP” (жёстко)

### Входит (Must-have)
- Reels feed (выдача + стабильная пагинация/семантика сессии)
- Playback (автоплей, паузы/возвраты) + корректные события
- Create Reels (выбор файла → базовая валидация → upload → publish)
- Минимальная модерация (blocked/allowed на уровне выдачи)
- Ranking v1 baseline через существующий Reels Engine config gate
- Негативный сигнал (not interested/hide) влияет на выдачу
- Observability базового уровня (метрики + reason-codes + fallback)

### Не входит (Won’t-have в Phase 0)
- Live
- Ads/монетизация/платежи
- Полноценный editor TikTok-level (только существующий простой editor/обрезка по текущей базе)
- Marketplace/Realty/Insurance/Taxi интеграции
- Multi-region
- AI pipeline

---

## 1) Принципы миграции (чтобы не переписать 70% через 6 месяцев)

1) **Не ломаем текущие surfaces**: используем существующие `ReelsPage/useReels/CreateReelSheet` как baseline поведения.
2) **Формализуем контракты**: feed/event/publish описываются как спецификации, затем под них выравнивается реализация.
3) **Idempotency как “необсуждаемо”**: каждый write‑action имеет стабильный ключ, а DB/RPC предотвращает дубли.
4) **D0.000 как чеклист**: DoD каждой задачи включает design‑соответствие.

---

## 2) Эпики Phase 0 (приоритетный порядок)

### EPIC A — Feed Contract + стабильная выдача
**Цель**: привести read‑path к стабильному, измеримому контракту, сохранив текущий RPC.

Задачи:
A1. Feed Contract Doc (Reels)
- Выход: документ контракта `get_reels_feed_v2` (поля, семантика `request_id`, `feed_position`, `algorithm_version`, “что такое сессия”).
- Интеграция: [src/hooks/useReels.tsx](src/hooks/useReels.tsx), SQL RPC `get_reels_feed_v2`.
- DoD: контракт стабилен и согласован с текущим payload.

A2. Cursor/Semantic Pagination Decision
- Выход: решение “offset‑based с `request_id` семантикой” или “opaque cursor” и как версионировать при смене конфига.
- DoD: определено поведение при смене активного конфига в середине сессии.

A3. Fallback Rules Spec
- Выход: правила деградации (если ранкер/слои недоступны) → recency feed.
- DoD: есть список зависимостей, при падении которых включается fallback.

Метрики EPIC A:
- `feed_page_latency_ms` (P50/P95)
- `empty_first_page_rate`
- `fallback_activation_rate`

Зависимости: нет (стартовый эпик).

---

### EPIC B — Playback State Machine + Event Integrity
**Цель**: сделать события “истиной” для алгоритма и защиты от накрутки.

Задачи:
B1. Playback State Machine Spec
- Выход: состояния `idle/loading/buffering/playing/paused/ended/error` и допустимые переходы.
- Интеграция: [src/pages/ReelsPage.tsx](src/pages/ReelsPage.tsx).

B2. Event Spec (impression/view_start/view_3s/view_10s/complete/skip)
- Выход: точные определения на уровне поведения (видимость, тайминги, что считать playhead).
- Интеграция: текущие реализации impression/progressive events.

B3. Event Idempotency & Dedup Spec
- Выход: ключи дедупа (viewer/session + item + type + time-bucket) и окно.
- DoD: описано, как система переживает retry/offline.

B4. Invalid Sequence Policy
- Выход: список невозможных последовательностей и реакция сервера (reject/log/flag).

Метрики EPIC B:
- `event_dedup_hit_rate`
- `invalid_sequence_reject_rate`
- `impression_to_view_start_ratio`

Зависимости: EPIC A (нужен стабильный request/session контекст).

---

### EPIC C — Create Reels MVP (upload→publish) с идемпотентностью
**Цель**: создание Reels без дублей и с предсказуемыми ошибками.

Задачи:
C1. Create Flow Behavior Spec
- Выход: пошаговое поведение create reels (выбор файла → pre-check → upload → publish → появление в профиле/ленте).
- Интеграция: [src/components/reels/CreateReelSheet.tsx](src/components/reels/CreateReelSheet.tsx), bucket `reels-media`.

C2. Upload Constraints Spec
- Выход: лимиты размера/типа/длительности и их источник (mode flags).
- DoD: клиент предупреждает, сервер повторно валидирует.

C3. Publish Idempotency Spec
- Выход: “stable client_publish_id” правила (как draft id в чате) и server-side гарантии “не создаётся дубль”.
- Прямая связь с уже сделанным: паттерн из чата (stable id на retry, in-flight lock, reconcile).

C4. Error Taxonomy (для UI)
- Выход: категории ошибок upload/publish (duration_limit_exceeded, size_limit_exceeded, unsupported_codec, policy_blocked, transient).
- DoD: для каждой категории есть user-action (retry/change/shorten).

Метрики EPIC C:
- `publish_idempotency_collision_rate`
- `upload_success_rate`
- `create_reel_failure_rate_by_code`

Зависимости: EPIC B (чтобы publish не ломал события/сессию), D0.000.

---

### EPIC D — Ranking v1 baseline через Reels Engine configs
**Цель**: иметь управляемый baseline ranking и возможность безопасно менять коэффициенты.

Задачи:
D1. Ranking v1 Spec (baseline)
- Выход: источники кандидатов + простая scoring функция + rerank ограничения (минимум diversity/anti-repeat).

D2. Config Schema Extension Plan
- Выход: какие параметры добавляются в JSON конфиг, как валидируются `reels_engine_validate_config_v1` (без реализации в Phase 0, только план).
- Интеграция: существующий gate propose/validate/activate.

D3. Reason Codes Spec
- Выход: формат `recommendation_reason` и минимальный набор кодов.
- Интеграция: `get_reels_feed_v2` уже отдаёт `recommendation_reason`.

Метрики EPIC D:
- `creator_diversity_index`
- `repeat_item_rate`
- `not_interested_effectiveness`

Зависимости: EPIC A, EPIC B.

---

### EPIC E — Minimal Moderation Gate
**Цель**: blocked контент не попадает в выдачу и не усиливается.

Задачи:
E1. Moderation Status Contract
- Выход: что означает `blocked/allowed` (и любые текущие статусы) и как они влияют на выдачу.

E2. Borderline placeholder decision
- Выход: в Phase 0 либо нет borderline, либо он treated как restrict (не в рекомендации).

Метрики EPIC E:
- `blocked_content_leak_rate` (целевое значение ~0)

Зависимости: EPIC A, EPIC D.

---

### EPIC F — Observability минимального уровня + Kill-switch plan
**Цель**: возможность расследовать проблемы ленты/плеера/публикации и откатываться.

Задачи:
F1. SLO mini-registry
- Выход: минимальные SLO по feed/playback/upload.

F2. Kill-switch catalog (план)
- Выход: какие переключатели нужны уже в Phase 0 (например: отключить персонализацию → recency feed).

F3. Incident checklist (Phase 0)
- Выход: что делать при spike ошибок/пустой ленте/массовых репортах.

Метрики EPIC F:
- `fallback_activation_rate`
- `feed_error_rate`
- `playback_start_failure_rate`

Зависимости: EPIC A–E.

---

## 3) “Внедрить в наши алгоритмы и логики, которые сделали ранее” (конкретно)

### 3.1 Берём из чата как стандарт для всей платформы
Ссылки:
- [src/hooks/useChat.tsx](src/hooks/useChat.tsx)
- [src/lib/chat/sendDmMessage.ts](src/lib/chat/sendDmMessage.ts)

Принципы, которые должны стать “шаблоном”:
- Стабильный client-id на ретраи (как draftClientMsgId).
- In-flight guards, чтобы двойной тап не отправил вторую запись.
- Optimistic state + reconcile, чтобы UX не “ждал realtime”.
- DB/серверная уникальность там, где это критично.

Применяем это к:
- publish intent (create reel)
- engagement events batching
- share-to-chat карточкам (у вас уже унификация DM отправки)

### 3.2 Берём из Reels Engine control-plane как стандарт изменения алгоритма
Ссылки:
- validate/activate gate миграции (см. связанный документ)

Принципы:
- Никаких “тайных коэффициентов в коде”.
- Любая смена коэффициентов проходит validate → activate.
- Любой показ имеет `algorithm_version` + reason-codes.

---

## 4) Acceptance Checklist Phase 0 (коротко)

Фаза считается готовой, если:
- Лента Reels выдаётся стабильно (нет прыжков/дублей в пределах сессии) и имеет fallback.
- Playback события считаются по контракту, последовательность валидируется, повторы дедупятся.
- Create Reels не создаёт дубли при повторном тапе/ретрае.
- Blocked контент не появляется в выдаче.
- Есть минимальные метрики и путь расследования (reason-codes, request_id correlation).
- Все UI изменения прошли D0.000 чеклист.

Gate → Phase 1 (критерии перехода):
- Feed/playback ошибки и пустые страницы в пределах согласованных порогов.
- Dedup/sequence rules для событий подтверждены на реальных ретраях/оффлайне.
- Create Reels не создаёт дубли при повторном тапе/таймауте.
- Есть минимальные reason-codes + request_id корреляция для расследований.

---

## 5) Как занести в трекер

- Каждый EPIC → отдельная Epic карточка.
- Каждая задача (A1…F3) → Story.
- DoD и метрики прикреплять к Story.
- D0.000 чеклист добавлять как подзадачу ко всем UI-Story.
