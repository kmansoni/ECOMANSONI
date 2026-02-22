# P0B — Playback + Event Integrity Spec (Phase 0 / EPIC B)

Дата: 2026-02-22

Статус: Draft (проектирование)

Цель: сделать события просмотра **истиной** для ранжирования/аналитики, защищённой от:
- повторных отправок (retry/offline),
- “накрутки скроллом”,
- гонок состояния плеера,
- расхождения client playback vs server counters.

Текущий baseline в репо:
- В UI уже есть impression (50%+видимость + 1 сек) и progressive viewed/watched/skip: [src/pages/ReelsPage.tsx](src/pages/ReelsPage.tsx)
- RPC запись impression используется в [src/hooks/useReels.tsx](src/hooks/useReels.tsx)

---

## 0) Ненарушаемые правила

- D0.000: все UI состояния буфера/ошибок/ограничений в едином стиле.
- Idempotency: каждое событие должно быть дедуплицируемым сервером.
- Server-side validation: сервер проверяет невозможные последовательности.

---

## 1) События (канонический словарь)

### 1.1 Impression
**Смысл:** item реально был показан пользователю.

Условие (Phase 0):
- элемент ролика видим ≥ 50% площади,
- удержан в этом состоянии ≥ 1000ms,
- не перекрыт полноэкранной модалкой (комменты/share) и не скрыт.

Payload (минимум):
- `reel_id`
- `viewer_id` или `session_id`
- `request_id` (из выдачи)
- `position` (`feed_position`)
- `algorithm_version`
- `client_event_id`
- `client_ts`

### 1.2 View_start
**Смысл:** началось реальное воспроизведение.

Условие:
- плеер в состоянии `playing`,
- получен первый кадр (или `onPlay` + подтверждённое увеличение currentTime).

### 1.3 View_2s (Viewed)
**Смысл:** пользователь реально посмотрел ≥ 2 секунды.

Условие:
- суммарный watched_time ≥ 2000ms (по playhead),
- не “таймером нахождения на экране”.

### 1.4 View_10s / View_50% / Complete (Watched)
**Смысл:** высокий сигнал просмотра.

Phase 0 baseline (фиксировано):
- Событие `watched` фиксируется, когда достигнут порог:
  - `min(10 секунд, 50% длительности)` по **реальному playhead**.

Пояснение:
- Для коротких роликов 50% наступает быстро.
- Для длинных роликов 10 секунд дают ранний, но не “мгновенный” сигнал.

### 1.5 Skip
**Смысл:** быстрый уход.

Условие:
- item был активным,
- но суммарный watched_time < 2000ms,
- и пользователь переключился на другой item.

### 1.6 Negative feedback
**Смысл:** явное обучение.

События:
- `not_interested`
- `hide`
- `report`

Требование:
- применяются к выдаче в пределах сессии (Stage 5/Ranking),
- имеют отдельные rate-limits (Stage 6).

---

## 2) Playback State Machine (обязательная модель)

Состояния:
- `idle`
- `loading`
- `buffering`
- `playing`
- `paused_user`
- `paused_system` (tab hidden, app background)
- `ended`
- `error`

Допустимые переходы (пример):
- idle → loading → playing
- playing → buffering → playing
- playing → paused_user → playing
- playing → paused_system → playing
- playing → ended
- any → error

Инварианты:
- события не могут отправляться “назад” (например complete до view_start).
- любой onPlay должен привязываться к current active reel.

---

## 3) Идемпотентность и дедуп (переносим proven‑паттерн из чата)

### 3.1 client_event_id
Каждое событие имеет `client_event_id`:
- генерируется один раз на событие,
- стабилен при retry,
- хранится локально до подтверждения отправки.

### 3.2 Dedup key (server-side)
Минимальная стратегия Phase 0:
- dedup по `(viewer_or_session, reel_id, event_type, time_bucket)`

Где `time_bucket`:
- для impression: 10 минут
- для view_start: 10 минут
- для viewed/watched/complete: 24 часа

Причина: защититься от offline resend и повторов сети.

### 3.3 Ordering validation (server-side)
Сервер отклоняет (reject) или помечает (flag) события, которые невозможны:
- complete без view_start
- view_10s без viewed
- watched при duration < 2s

Политика Phase 0:
- для метрик (counters) события отклоняются,
- для антиабьюза события логируются как anomaly.

---

## 4) Связь событий с выдачей (request_id)

Требование:
- каждый event должен включать `request_id`, который пришёл из feed,
- это позволяет:
  - расследовать “почему показали”,
  - измерять эффективность конфигурации.

---

## 5) Offline queue / batching (поведение)

Phase 0 — минимальные требования:
- события отправляются пачками (batch) с ограничением размера,
- при отсутствии сети складываются в очередь,
- при восстановлении сети отправляются повторно,
- дедуп на сервере защищает от повторов.

---

## 6) Метрики качества событий

Минимум:
- `event_dedup_hit_rate`
- `invalid_sequence_reject_rate`
- `impression_to_view_start_ratio`
- `view_start_to_viewed_ratio`
- `viewed_to_watched_ratio`
- `playback_start_failure_rate`

Аномалии (триггеры):
- impression растёт, а view_start нет → накрутка/ошибка autoplay.
- too many completes per minute → бот.

---

## 7) Acceptance tests (сценарии)

### T1: retry/offline
- выключить сеть
- проскроллить 5 роликов
- включить сеть
Ожидание:
- события доезжают,
- счётчики не “взрываются” из-за повторов,
- `event_dedup_hit_rate` > 0, но counters корректны.

### T2: скролл‑накрутка
- быстро проскроллить 20 роликов
Ожидание:
- impressions ограничены правилом 1 сек,
- viewed/watched почти нет.

### T3: модалки
- открыть комменты/шэр в момент просмотра
Ожидание:
- watched_time не накапливается, если видео реально остановлено.

---

## 8) Открытые вопросы

## 8) Решения Phase 0 (без открытых вопросов)

### 8.1 Watched rule
Решение:
- Используем `watched = min(10s, 50% duration)` (описано в разделе 1.4).

### 8.2 Источник истины событий
Решение:
- Источник истины — server-side RPC `record_*` и их серверные таблицы.
- Клиентские счётчики/локальные состояния не являются источником истины.

Привязка к текущему репо:
- В Phase 0 мы используем текущие RPC, которые уже вызываются из [src/hooks/useReels.tsx](src/hooks/useReels.tsx).

### 8.3 Autopause при модалках/оверлеях
Решение:
- При открытии overlay, который закрывает контент (комменты/share/любой sheet), активный ролик **обязан** переходить в `paused_system`.
- В этом состоянии watched_time не накапливается.

Зачем:
- предотвращает “накрутку просмотром под модалкой”,
- выравнивает события с реальным UX.
