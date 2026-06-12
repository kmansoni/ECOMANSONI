# P0A — Reels Feed Contract Spec (Phase 0 / EPIC A)

Дата: 2026-02-22

Статус: Draft (проектирование)

Цель: зафиксировать **железный** контракт выдачи Reels feed, чтобы:
- UI не видел дублей/прыжков/пропусков при скролле,
- алгоритм был управляем конфигами и дебажился (request_id / reason-codes),
- приватность и блок‑листы enforced сервером,
- система деградировала предсказуемо (fallback),
- всё было совместимо с текущим репозиторием.

Связанные файлы/факты в репо:
- Основной read-path сейчас: RPC `get_reels_feed_v2` вызывается из [src/hooks/useReels.tsx](src/hooks/useReels.tsx)
- UI использует `request_id`, `feed_position`, `algorithm_version`, `final_score`: [src/pages/ReelsPage.tsx](src/pages/ReelsPage.tsx)
- В SQL уже есть fallback pass (при пустой первой странице): [supabase/migrations/20260221143000_get_reels_feed_v2_fallback_and_visibility.sql](supabase/migrations/20260221143000_get_reels_feed_v2_fallback_and_visibility.sql)

---

## 0) Ненарушаемые правила

### D0.000 (Design Compliance)
Новые состояния ленты/ошибок/пустых экранов:
- только существующие визуальные примитивы (glass панели, текущие цвета/отступы/радиусы),
- safe-area/100dvh,
- без “новой” типографики/паттернов.

### P0.000 (Server-side enforcement)
Лента **никогда** не должна полагаться на client-side фильтрацию для:
- visibility (public/private/friends/subscribers),
- блокировок user↔user,
- возрастных/гео ограничений,
- moderation блокировок.

### O0.000 (Observability)
Каждая выдача должна иметь:
- `request_id` (уникальный на страницу/запрос),
- `algorithm_version` (какая версия конфигурации/алгоритма),
- `recommendation_reason` (reason-codes).

---

## 1) Термины

- **Feed page**: порция результатов (N items) + маркер продолжения.
- **Viewer**: пользователь (auth.uid()) либо гость (anon session).
- **Session**: идентификатор просмотра ленты, связывающий impression/feedback.
- **Cursor**: непрозрачный маркер пагинации (либо эквивалентные правила offset).
- **Config version**: активная конфигурация Reels Engine (control-plane) + сегмент.
- **Dedup window**: окно, в котором item не должен повторяться.

---

## 2) Проблемы, которые этот контракт закрывает

### 2.1 Дубли и прыжки
Симптомы:
- при повторном fetch или при смене сегмента/конфига пользователь видит уже показанные ролики,
- при подгрузке следующей страницы выдача “перемешивается”.

Причины:
- нефиксированная семантика курсора/offset,
- разная версия конфигурации на соседних страницах,
- недостаточная дедупликация на server-side.

### 2.2 Пустая первая страница
Причины:
- слишком строгие caps (freq-cap, блокировки, повторная выдача),
- недостаток кандидатов.

Решение:
- явный fallback режим (safe/recency pass), измеримый как метрика.

---

## 3) Contract v2 (как сейчас) — фиксируем поведение

### 3.1 Входные параметры (как в репо)
Текущее использование:
- `p_limit` (например 50)
- `p_offset` (0, 50, 100…)
- `p_session_id` (null для authed, `anon-<uuid>` для гостя)

**Правило:** Phase 0 допускает offset-based выдачу, но контракт обязан зафиксировать семантику:
- `p_offset` — позиция **в рамках request_id/algorithm_version контекста**.
- При смене `algorithm_version` offset выдача может стать нестабильной → требуется режим “cursor expired” или “pin algorithm_version per session”.

### 3.2 Выходные поля (как в SQL)
Минимальный набор:
- `id`
- `author_id`
- `video_url`, `thumbnail_url`
- счётчики (likes/comments/views/saves/reposts/shares)
- `created_at`
- `final_score`
- `recommendation_reason`
- `request_id`
- `feed_position`
- `algorithm_version`

**Обязательное правило:** на одной странице `request_id` должен быть один и тот же для всех строк.

---

## 4) Contract v3 (рекомендовано) — как сделать "железно" без ломания UI

Phase 0 может продолжать использовать v2, но **проектирование** должно сразу предусмотреть v3.

### 4.1 Новые входные параметры (добавочные)
- `p_cursor` (text, nullable): opaque cursor; если задан, `p_offset` игнорируется.
- `p_environment` (text, default 'prod'): какую активную конфигурацию использовать.
- `p_segment_id` (uuid/text, nullable): сегмент эксперимента.
- `p_pinned_algorithm_version` (text, nullable): если задан, выдача фиксируется на эту версию.
- `p_dedup_window` (int, default 100): размер сессионного окна (сколько последних items исключать).

### 4.2 Ответ v3
Добавить к каждому item (или на уровне страницы):
- `next_cursor` (text) — маркер продолжения
- `page_info`:
  - `algorithm_version`
  - `config_version_id` (если есть)
  - `segment_id`
  - `mode` = `strict|fallback_recency|fallback_no_freqcap` (как минимум)
  - `generated_at`

**Правило:** если `cursor` устарел (смена алгоритма/сегмента) → ответ должен явно сигнализировать `cursor_expired=true`.

---

## 5) Session/identity rules

### 5.1 Authed viewer
- `viewer_id = auth.uid()`
- `session_id = null` (можно оставить null, но лучше иметь `session_id` для корреляции на клиенте)

### 5.2 Guest viewer
- `viewer_id = null`
- `session_id = 'anon-' + uuid` (как сейчас в [src/hooks/useReels.tsx](src/hooks/useReels.tsx))

### 5.3 Инвариант
В пределах одной сессии:
- dedup window обязателен,
- caps (freq-cap) обязателен (кроме fallback).

---

## 6) Dedup & frequency caps

### 6.1 Item dedup (обязателен)
Правило: item не должен повторяться в окне `dedup_window` по ключу (viewer/session).

### 6.2 Author frequency cap (обязателен)
Правило: не более X items одного автора в окне M (параметры в конфиге).

### 6.3 Источник правды
- dedup и caps должны применяться в SQL/RPC.
- клиент не должен “допиливать” выдачу фильтрами (иначе будет пустота и ломающийся cursor).

---

## 7) Privacy, blocks, moderation

### 7.1 Visibility matrix (Phase 0)
- `public`: доступно всем.
- `private/friends/subscribers`: Phase 0 допускает упрощение, но правило должно быть единым по платформе.

### 7.2 Blocks
Определить единую политику (двусторонняя или нет) и применять её в выдаче.

### 7.3 Moderation
- `blocked` content не попадает в выдачу.
- `borderline` (если введён) не попадает в explore/recommendations.

---

## 8) Fallback режимы (без падения продукта)

### 8.1 Fallback trigger
Срабатывает если:
- strict pass вернул 0 строк на `offset=0` (как уже сделано),
- или ranker timeout,
- или зависимость недоступна.

### 8.2 Fallback modes (минимум)
- `fallback_no_freqcap` (ослабление caps на первой странице)
- `fallback_recency` (простая сортировка с фильтрами безопасности)

### 8.3 UX правило
UI показывает выдачу как обычно; только в debug/admin можно показывать `mode`.

---

## 9) Observability (что логировать/измерять)

### 9.1 Метрики (минимум)
- `feed_page_latency_ms` (P50/P95)
- `empty_first_page_rate`
- `fallback_activation_rate` (по mode)
- `duplicate_suppression_rate`

### 9.2 Корреляция
- `request_id` должен быть доступен клиенту и передаваться в impression/event RPC.

---

## 10) Acceptance tests (без кода, сценарии)

### T1: стабильная пагинация
- Открыть Reels.
- Пролистать 3 страницы.
- Обновить страницу/перезайти (в пределах одной сессии).
Ожидание:
- повторов в окне dedup нет,
- `request_id` меняется по страницам, но не внутри страницы,
- порядок в пределах страницы стабилен.

### T2: fallback
- Смоделировать ситуацию строгого фильтра (например, много not_interested).
Ожидание:
- первая страница не пустая,
- `mode` фиксируется как fallback,
- метрика `fallback_activation_rate` растёт.

### T3: privacy
- Заблокировать автора/контент.
Ожидание:
- контент не появляется ни в каких страницах.

---

## 11) Решения Phase 0 (без открытых вопросов)

### 11.1 Пагинация: Phase 0 = offset + pinned algorithm version
Решение:
- **В Phase 0 остаёмся на текущем контракте `p_limit/p_offset`** (не ломаем RPC и UI).
- Добавляем правило контракта: **algorithm_version pinned per session**.

Что значит “pinned”:
- Когда пользователь открывает Reels, клиент получает `algorithm_version` с первой страницы.
- Все следующие запросы в рамках этой сессии должны выполняться так, как будто алгоритм/конфиг не менялся.
- Если на сервере активировали новый конфиг во время сессии — он применяется только к новой сессии.

Зачем:
- offset‑пагинация остаётся стабильной.
- A/B и rollout не ломают UX.

### 11.2 Blocks: Phase 0 = двустороннее исключение из выдачи
Решение:
- Если A блокирует B или B блокирует A, контент между ними **взаимно исключается** из выдачи.

Зачем:
- проще объяснить пользователю,
- меньше риск утечек приватности через рекомендации.

### 11.3 Visibility: Phase 0 = public only для рекомендаций
Решение:
- В Phase 0 в Reels feed/Explore участвуют только items со статусом **public**.
- Контент `private/friends/subscribers` может существовать в продукте, но не рекомендоваться и не попадать в общий Reels feed.

Зачем:
- не делаем “театральную безопасность” до готового social graph,
- уменьшаем surface area ошибок в MVP.
