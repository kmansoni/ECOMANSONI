# P1K — Moderation v1 Spec (Queues + SLA + Appeals + Borderline + Mass-report Guard)

Дата: 2026-02-22

Статус: Draft (проектирование)

Цель Phase 1:
- перейти от Phase 0 “blocked/allowed” к операционно устойчивой модерации,
- не допускать усиления токсичного контента алгоритмом,
- защищаться от weaponized reports,
- иметь SLA очередей и жизненный цикл апелляции.

Входные слои:
- Phase 0 moderation gate: [docs/specs/phase0/P0E-moderation-gate-minimal.md](docs/specs/phase0/P0E-moderation-gate-minimal.md)
- Trust/enforcement: [docs/specs/phase1/P1L-trust-lite-rate-limits-enforcement.md](docs/specs/phase1/P1L-trust-lite-rate-limits-enforcement.md)

---

## 0) Ненарушаемые правила

- Server-side enforcement: решения модерации влияют на surfaces (feed/explore/share/link).
- Borderline не попадает в рекомендации.
- Любое админское действие аудируется (immutable audit — в Phase 3/16, но запись обязательна уже сейчас).
- D0.000: пользовательские тексты нейтральны, без “красных” паник.

---

## 1) Статусы и решения модерации (Phase 1)

### 1.1 Moderation decision
- `allow`
- `restrict` (ограничить распространение)
- `needs_review`
- `block`

### 1.2 Content distribution class
- `green` (нормальная дистрибуция)
- `borderline` (не в рекомендации/тренды)
- `red` (blocked)

Mapping:
- allow → green
- restrict → borderline
- needs_review → borderline (пока не решено)
- block → red

---

## 2) Surface matrix (обязательная)

Поверхности:
- S1 Reels feed
- S2 Explore
- S3 Profile owner view
- S4 Direct link
- S5 Share card (chat/channel)

Правила:

### Green
- S1 ✅
- S2 ✅
- S3 ✅
- S4 ✅
- S5 ✅

### Borderline
- S1 ❌
- S2 ❌
- S3 ✅ (владельцу)
- S4 ✅ (только если есть права/по прямой ссылке; можно ограничить)
- S5 ✅/❌ (решение Phase 1: **❌ по умолчанию**, чтобы не обходили ограничения пересылкой)

### Red (blocked)
- S1 ❌
- S2 ❌
- S3 ✅ владельцу (и admin)
- S4 ❌ для обычных
- S5 ❌

---

## 3) Moderation queues (архитектура)

Очереди разделяются по:
- регион/язык (если известно)
- категория риска (NSFW/violence/spam/copyright)
- приоритет

### 3.1 Приоритизация
Повышаем приоритет если:
- массовые репорты от trusted tier
- низкий trust автора
- высокий velocity распространения

Понижаем приоритет если:
- репорты от low-trust аккаунтов
- выявлен mass-report attack

---

## 4) SLA (численные цели Phase 1)

- `needs_review` время ожидания:
  - P50 ≤ 6 часов
  - P95 ≤ 24 часа

- Appeals:
  - E3 (distribution restricted): ≤ 48 часов
  - E4 (suspension): ≤ 24 часа

---

## 5) Mass-report abuse guard

Цель: не позволить группе аккаунтов “сломать” автора через репорты.

Механики Phase 1:

### 5.1 Trust-weighted reports
- репорты из Tier A/B имеют больший вес,
- репорты из Tier D имеют минимальный вес.

### 5.2 Reporter quality score
Для каждого репортера считаем:
- доля подтверждённых репортов
- доля отклонённых

Если quality низкий:
- репорты перестают влиять на авто-эскалацию.

### 5.3 Burst detection
Если репорты на один item приходят:
- “слишком быстро”
- из коррелированной группы
→ помечаем как возможную атаку.

Реакция:
- временно переводим item в `needs_review`,
- но не `block` автоматически.

---

## 6) Appeals lifecycle (Phase 1)

Состояния апелляции:
- `submitted`
- `in_review`
- `accepted`
- `rejected`

Правила:
- у пользователя есть ограничение частоты апелляций (anti-spam)
- решение апелляции аудируется

---

## 7) Admin tools (минимум)

Админ должен видеть:
- контент + метаданные
- trust автора
- отчёт: количество репортов, веса, burst flags
- reason codes автоматики

Действия:
- allow / restrict / block
- escalate

---

## 8) Observability

Метрики:
- `moderation_queue_lag_minutes`
- `appeal_turnaround_hours`
- `borderline_leak_rate` (должно быть ~0)
- `mass_report_attack_flag_rate`
- `report_to_action_time_minutes`

---

## 9) Acceptance checklist

Готово если:
- есть статусы allow/restrict/needs_review/block
- есть surface matrix и нет leakage
- очереди приоритизируются
- SLA задан и измерим
- mass-report guard работает (trust-weighted + burst)
- appeals lifecycle доступен
- UI соответствует D0.000
