# P0C — Create Reels MVP (Upload→Publish) Spec (Phase 0 / EPIC C)

Дата: 2026-02-22

Статус: Draft (проектирование)

Цель: сделать создание Reels как Instagram/TikTok по ощущению, но **железно** по системе:
- без дублей при double-tap/timeout/retry,
- с быстрым UX (optimistic state),
- с предсказуемыми категориями ошибок,
- совместимо с текущим репо (Supabase Storage `reels-media` + insert в `reels`).

Текущий baseline в репо:
- Upload в bucket `reels-media` и insert в `reels`: [src/components/reels/CreateReelSheet.tsx](src/components/reels/CreateReelSheet.tsx)
- Простой editor доступен в проекте (useMediaEditor / SimpleMediaEditor), уже применяется в сторис/постах.
- Idempotency паттерн уже доказан в чате (stable client id + upsert/onConflict + optimistic + reconcile): [src/hooks/useChat.tsx](src/hooks/useChat.tsx)

---

## 0) Ненарушаемые правила

- D0.000: UI Create/Reels публикуется только в вашей дизайн‑системе.
- I0.000: все write операции идемпотентны.
- P0.000: server-side validation (клиентские лимиты — только UX).

---

## 1) Сущности и идентификаторы (Phase 0)

### 1.1 Create Intent (client_publish_id)
Решение Phase 0:
- На каждый “намеренный publish” создаётся **стабильный** `client_publish_id`.
- Он не меняется при ретраях после таймаута/ошибки сети.

Как генерируется:
- при первом нажатии “Опубликовать” (или при переходе на publish step) генерируется UUID.
- сохраняется в памяти UI (и желательно в localStorage/sessionStorage для crash-retry).

Аналогия:
- это прямой перенос `draftClientMsgId` из чата.

### 1.2 Upload object key
Решение Phase 0:
- путь в storage должен быть детерминированно связан с `client_publish_id`.

Пример path convention (только контракт):
- `{user_id}/reels/{client_publish_id}/original.mp4`

Зачем:
- повторная загрузка/commit не создаёт второй объект.

---

## 2) UX Flow (без “доп страниц”, в рамках текущего продукта)

### 2.1 Entry points
- “+” / Create surface (пока может быть CreateReelSheet).

### 2.2 Steps
S1 — Select
- выбрать видео файл.

S2 — Pre-check (client)
- тип `video/*`.
- размер ≤ лимита (Phase 0: текущие 100MB как baseline из QA doc).
- длительность ≤ 90s (Reels mode).

S3 — Optional light edit
- если включено: trim/cover selection (использовать существующий editor слой, не добавлять новый).

S4 — Publish
- caption/music_title (минимально).
- visibility: Phase 0 только `public` для рекомендаций (см. P0A).
- CTA “Опубликовать”.

---

## 3) State machine (client) — строго

Состояния publish процесса:
- `idle`
- `validating`
- `uploading`
- `upload_committing` (если есть отдельный commit)
- `publishing`
- `published`
- `failed`
- `canceled`

Инварианты:
- при `uploading/publishing` UI блокирует повторный тап (in-flight guard).
- retry не меняет `client_publish_id`.

Optimistic UX:
- после старта `publishing` можно показывать optimistic карточку “публикуется” в профиле/черновиках.

---

## 4) Write-path (server) — идемпотентность

Phase 0, без переписывания всего backend:
- upload в storage `reels-media` по детерминированному пути,
- затем insert/upsert в таблицу `reels`.

Требование:
- операция insert в `reels` должна иметь конфликт-стратегию по `client_publish_id` (или эквивалентному ключу).

Если сейчас в `reels` нет такого поля:
- Phase 0 проектирование требует добавить поле (или отдельную таблицу intent mapping) в ближайшей миграции.

---

## 5) Error taxonomy (UI + logs)

Все ошибки должны иметь:
- `code` (stable)
- `message` (user-friendly)
- `retryable` (bool)
- `action` (что сделать пользователю)

Категории Phase 0:

### 5.1 Client validation
- `file_type_not_supported` → выбрать другой файл
- `file_size_limit_exceeded` → выбрать меньший
- `duration_limit_exceeded` → обрезать

### 5.2 Upload/storage
- `upload_network_error` (retryable)
- `upload_permission_denied` (action: login/permissions)
- `upload_bucket_missing` (action: admin)
- `upload_conflict_object_exists` (treat as success if same intent)

### 5.3 Publish DB
- `publish_conflict_duplicate_intent` (treat as success)
- `publish_validation_failed` (not retryable without user change)
- `publish_rate_limited` (retry after)

### 5.4 Unknown
- `unknown_error` (retryable false by default)

---

## 6) Server-side validation (Phase 0)

Проверки на сервере должны повторять ключевые лимиты:
- длительность ≤ 90s
- размер ≤ лимита
- тип/кодек допустим
- visibility allowed

Результат ошибки должен быть в таксономии выше.

---

## 7) Observability

Минимум метрик:
- `create_reel_attempts`
- `create_reel_success`
- `create_reel_failure_by_code`
- `publish_idempotency_collision_rate`
- `upload_latency_ms` (P50/P95)

Корреляция:
- `client_publish_id` логируется на всех стадиях.

---

## 8) Acceptance tests (сценарии)

### T1: double-tap publish
- Нажать “Опубликовать” 2–3 раза быстро.
Ожидание:
- в БД ровно 1 reel,
- UI показывает один результат.

### T2: timeout + retry
- Смоделировать таймаут publish (например, разрыв сети после upload).
- Нажать retry.
Ожидание:
- `client_publish_id` не меняется,
- результат: 1 reel.

### T3: invalid duration
- выбрать видео 95 сек.
Ожидание:
- client pre-check предупреждает,
- сервер reject если пытаться обойти.

---

## 9) Решения Phase 0 (без открытых вопросов)

- Reels recommendations: только `public`.
- Upload path: детерминированный от `client_publish_id`.
- Publish: idempotent по `client_publish_id`.
- Ошибки: только через taxonomy.
