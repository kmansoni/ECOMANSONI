# Phase 1 — PMF Execution Plan (Tracker-ready, no code)

Дата: 2026-02-22

Оценка длительности: 10–16 недель (см. [docs/phases-overview-roadmap.md](docs/phases-overview-roadmap.md))

Назначение: план работ после Phase 0 (Core MVP) для достижения **product–market fit** по Reels/UGC (рост удержания, discovery, creator loop), без преждевременного усложнения (ads/marketplace/etc.).

Ограничения:
- **Без кода**.
- D0.000: строгая совместимость с вашим общим дизайном платформы.
- Server-side enforcement.
- Idempotency everywhere.

Предпосылка: Phase 0 завершён и принят по [docs/phase0-core-mvp-execution-plan.md](docs/phase0-core-mvp-execution-plan.md)

---

## 0) Что считается Phase 1 (PMF) (жёстко)

### Входит (Must-have)
- Explore/Discovery surface (вне основной ленты)
- Hashtags + базовые тренды (trust-weighted)
- Ranking v2 (diversity, cold start improvements, negative feedback effectiveness)
- Creator analytics (минимально полезные инсайты)
- Moderation v1 (очереди + SLA + appeals базового уровня)
- Anti-abuse v1 (trust-lite, rate limits на ключевые действия)
- Observability расширение (guardrails, rollout, auto-rollback для конфигов)

### Опционально (в конце Phase 1, только если метрики позволяют)
- Live beta (закрытая, с жёстким trust gate и kill-switch)

### Не входит (Won’t-have)
- Полноценные Ads/монетизация (не раньше Phase 2)
- Payments, gifts, subscriptions
- Marketplace/Realty/Insurance/Taxi интеграции
- Multi-region
- Полный AI слой (разрешён только “AI moderation assist lite” как инструмент для админов, если есть ресурс)

---

## 1) Метрики Phase 1 (главные KPI + guardrails)

### KPI (успех)
- Retention: D1/D7 (вы выбрать целевые значения)
- Avg session duration (Reels)
- Completion rate (по cohort/устройствам)
- Share rate / Save rate
- Creator activation: % пользователей, создавших 1+ Reel за неделю

### Guardrails (безопасность/качество)
- Report rate per 1k impressions
- Hide / Not interested rate (как негативный сигнал)
- Feed latency P95
- Playback start failure rate
- Moderation queue lag (SLA)

---

## 2) Эпики Phase 1 (приоритетный порядок)

### EPIC G — Explore/Discovery Surface
**Цель**: дать пользователю “pull” поверхность исследования, не ломая основной feed.

Задачи:
G1. Discovery UX Spec
- Выход: описание экранов Explore (категории/подборки/новые авторы/теги) в рамках D0.000.
- DoD: использует существующие карточки и визуальные паттерны.

G2. Candidate sources for Explore
- Выход: список источников кандидатов (trending, fresh, topic clusters) и квоты.

G3. Discovery ranking contract
- Выход: чем отличается ранжирование Explore от Reels feed (вес текстовых/трендовых сигналов).

Метрики EPIC G:
- `explore_open_rate`, `explore_to_watch_rate`
- `explore_session_length`

Зависимости: Phase 0 Ranking baseline + Event integrity.

---

### EPIC H — Hashtags + Trends (trust-weighted)
**Цель**: структурированный discovery и рост через тренды без дешёвой накрутки.

Задачи:
H1. Hashtag canonicalization rules
- Выход: нормализация тегов, лимиты, анти-stuffing.

H2. Hashtag moderation rules
- Выход: скрытие/ограничение токсичных тегов.

H3. Trend spec
- Выход: velocity + unique creators + trust-weighted engagement + decay.

Метрики EPIC H:
- `hashtag_click_rate`, `hashtag_watch_rate`
- `trend_anomaly_flag_rate`

Зависимости: Anti-abuse v1 (trust-lite).

---

### EPIC I — Ranking v2 (Diversity + Cold Start + Negative Feedback)
**Цель**: TikTok-поведение выдачи без “эхо-камеры”, управляемо через конфиги.

Задачи:
I1. Ranking v2 Spec
- Выход: точные rerank constraints (author cap, topic diversity window, repeat suppression), cold start режим.

I2. Config schema evolution plan
- Выход: какие параметры добавляем в текущий Reels Engine config + как они валидируются (gate).

I3. Guardrails + auto-rollback spec
- Выход: условия отката конфигов при росте report rate или падении retention.

I4. Explainability expansion
- Выход: reason-codes расширяются до “top-3 причины + penalties”.

Метрики EPIC I:
- `creator_diversity_index`
- `not_interested_effectiveness`
- `repeat_item_rate`

Зависимости: Observability/metrics (иначе нельзя откатывать).

---

### EPIC J — Creator Analytics (минимально полезный набор)
**Цель**: удержать создателей, дать им рычаг улучшения контента.

Задачи:
J1. Creator metrics spec
- Выход: набор метрик на уровне видео (retention proxy, views, saves, shares) + на уровне профиля.

J2. Creator insights UX spec
- Выход: экраны/карточки аналитики в D0.000.

J3. Integrity & sampling rules
- Выход: какие события считаем “истиной” (только после Event integrity).

Метрики EPIC J:
- `creator_return_rate`
- `creator_publish_frequency`

Зависимости: Event integrity и стабильная выдача.

---

### EPIC K — Moderation v1 (Queues + SLA + Appeals)
**Цель**: рост без токсичности и без блокировки честных.

Задачи:
K1. Queue model + SLA
- Выход: категории очередей и SLA, приоритеты.

K2. Appeals flow (basic)
- Выход: правила апелляции, статусы, аудит.

K3. Borderline distribution policy
- Выход: что ограничиваем в рекомендациях.

Метрики EPIC K:
- `moderation_queue_lag_minutes`
- `appeal_turnaround_hours`

Зависимости: Anti-abuse v1.

---

### EPIC L — Anti-abuse v1 (Trust-lite + rate limits)
**Цель**: защитить события/ранжирование/тренды от накрутки.

Задачи:
L1. Trust-lite spec
- Выход: минимальный trust score (аккаунт возраст, device stability, anomaly flags) и влияние на reach/лимиты.

L2. Rate limits spec
- Выход: лимиты на publish, likes, comments, reports (завязка на trust).

L3. Anomaly detection rules (basic)
- Выход: velocity rules, mass-report attack guard.

Метрики EPIC L:
- `rate_limit_trigger_rate`
- `suspected_bot_session_rate`

Зависимости: Event integrity.

---

### EPIC M — Observability расширение (Rollouts + Kill-switch hardening)
**Цель**: безопасно экспериментировать с ranking/discovery.

Задачи:
M1. SLO/Guardrails registry expansion
- Выход: список метрик, которые блокируют rollout.

M2. Kill-switch coverage
- Выход: перечень выключателей Phase 1 (disable explore, disable personalization, strict safety mode).

M3. Incident playbooks
- Выход: процедуры реакций на spikes.

Метрики EPIC M:
- `rollback_trigger_rate`, `time_to_rollback_minutes`

Зависимости: все эпики, которые меняют выдачу.

---

### EPIC N — Live beta (только если Phase 1 KPI зелёные)
**Цель**: очень ограниченный запуск live для проверки спроса.

Условия входа:
- Trust-lite работает.
- Kill-switch готов.
- Moderation SLA не разваливается.

Задачи:
N1. Live beta policy
- Выход: кто может запускать live, лимиты, гео/возраст.

N2. Live UX spec (D0.000)
- Выход: экраны запуска/комнаты/завершения.

N3. Live safety guardrails
- Выход: массовые репорты → авто-ограничение.

Метрики EPIC N:
- `live_start_success_rate`
- `live_report_rate`

---

## 3) Acceptance Checklist Phase 1

Phase 1 считается завершённой, если:
- Есть Explore + hashtags + trends без дешёвой накрутки.
- Ranking v2 даёт измеримый рост KPI при соблюдении guardrails.
- Negative feedback влияет на выдачу в пределах сессии.
- Creator analytics повышает creator return rate.
- Moderation v1 держит SLA и есть appeals.
- Trust-lite и rate limits снижают аномалии.
- Rollouts и auto-rollback работают.
- Все UI изменения соответствуют D0.000.

Gate → Phase 2 (критерии перехода):
- KPI растут (retention/session/completion) при сохранении/улучшении guardrails (report/hide).
- Rollout/rollback реально работает (есть canary rollout с измерением и откатом по guardrail).

---

## 4) Как занести в трекер

- Каждый EPIC (G…N) → Epic.
- Каждая задача (G1…N3) → Story.
- DoD + метрики + D0.000 чеклист → обязательные поля Story.
