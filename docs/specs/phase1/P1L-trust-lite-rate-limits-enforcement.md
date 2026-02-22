# P1L — Trust-lite + Rate Limits + Progressive Enforcement Spec (Phase 1 / EPIC L)

Дата: 2026-02-22

Статус: Draft (проектирование)

Цель: защитить Phase 1 (PMF) от накрутки, спама и cost‑абьюза без массовых ложных банов.

Это базовый слой, который влияет на:
- тренды/хештеги,
- ranking v2,
- модерацию очередей,
- (будущие) ads/монетизацию.

Входные данные из Phase 0:
- события просмотров/фидбека по контракту: [docs/specs/phase0/P0B-playback-event-integrity.md](docs/specs/phase0/P0B-playback-event-integrity.md)
- create reels процесс: [docs/specs/phase0/P0C-create-reels-upload-publish.md](docs/specs/phase0/P0C-create-reels-upload-publish.md)
- observability/killswitch: [docs/specs/phase0/P0F-observability-slo-killswitch.md](docs/specs/phase0/P0F-observability-slo-killswitch.md)

---

## 0) Ненарушаемые правила

- Server-side enforcement: лимиты и enforcement применяются сервером.
- D0.000: все ограничения/уведомления — в вашем стиле, без “красных паник”.
- Appeal‑safe: любые жёсткие действия должны быть обжалованы.

---

## 1) Trust-lite model (Phase 1)

### 1.1 Trust score (0..100)
Trust score вычисляется из групп сигналов (в Phase 1 — простой детерминированный скоринг, без ML):

**Account signals**
- возраст аккаунта
- подтверждения (email/phone — если есть)

**Device/session stability**
- стабильность device fingerprint (если используете)
- количество уникальных устройств за 7/30 дней

**Behavioral integrity**
- invalid sequence rate (события)
- abnormal velocity (лайки/скролл/комменты)

**Community risk**
- доля подтверждённых репортов
- доля отклонённых репортов (для репортера)

Выход:
- `trust_score`
- `risk_tier` (см. 1.2)

### 1.2 Risk tiers (фиксировано)
- Tier A (80–100): trusted
- Tier B (60–79): normal
- Tier C (40–59): limited
- Tier D (0–39): restricted

Инвариант:
- Tier не может “упасть на 2 уровня” за одну ночь без явного инцидента/сигнала.

---

## 2) Progressive enforcement (Phase 1 state machine)

Уровни enforcement (E0..E5):
- E0: none
- E1: soft throttling (понижение reach в рекомендациях, лёгкие лимиты)
- E2: hard throttling (сильнее лимиты на действия)
- E3: distribution restricted (не попадает в рекомендации/тренды)
- E4: temporary suspension (временная блокировка создания/комментов)
- E5: permanent ban (только при строгих условиях)

Переходы:
- E0→E1: abnormal velocity / низкий trust
- E1→E2: повторные нарушения + подтверждённые сигналы
- E2→E3: высокая вероятность накрутки/спама
- E3→E4: повторное подтверждённое нарушение
- E4→E5: repeat offender + ручное подтверждение (Phase 1: через admin)

Обратные переходы:
- автоматическое понижение уровня строгости (cooldown) при отсутствии нарушений.

---

## 3) Rate limits table (обязательная матрица)

Ниже — baseline лимиты Phase 1. Все лимиты должны быть:
- различаться по tier,
- измеряться и тюниться конфигом,
- иметь `retry_after` на клиент.

### 3.1 Publish limits (Reels)
- Create/publish reels per day:
  - Tier A: 20
  - Tier B: 10
  - Tier C: 5
  - Tier D: 0–2 (в зависимости от risk)

- Upload bytes per day:
  - Tier A: 2GB
  - Tier B: 1GB
  - Tier C: 300MB
  - Tier D: 50MB

### 3.2 Engagement limits
- Likes per minute:
  - A: 60
  - B: 30
  - C: 10
  - D: 0–5

- Comments per minute:
  - A: 10
  - B: 5
  - C: 2
  - D: 0

- Reports per minute:
  - A: 5
  - B: 3
  - C: 1
  - D: 0

### 3.3 Discovery manipulation limits
- Hashtag creations per day:
  - A: 50
  - B: 20
  - C: 5
  - D: 0

---

## 4) Anomaly detection (Phase 1 deterministic)

### 4.1 Velocity rules
Флаги:
- слишком много действий за короткое время
- слишком ровные интервалы (automation)

### 4.2 Event integrity rules
- высокий `invalid_sequence_reject_rate`
- высокий `event_dedup_hit_rate` (не сетевой, а поведенческий паттерн)

### 4.3 Graph-lite rules
Phase 1 минимально:
- кластер аккаунтов, которые только лайкают друг друга

Выход:
- `anomaly_flags[]` с reason codes

---

## 5) Влияние на ранжирование и тренды

### 5.1 Trust-weighted signals
- Engagement событий от Tier D снижает вес.

### 5.2 Distribution restriction
- При E3 контент автора не участвует в:
  - Explore
  - Trends
  - рекомендациях Reels

---

## 6) Appeals (минимум Phase 1)

Если пользователь в E3+:
- показываем нейтральное уведомление (D0.000)
- даём кнопку “Обжаловать”

SLA:
- P1: 48 часов для E3
- P0: 24 часа для E4

---

## 7) Observability

Метрики:
- `rate_limit_trigger_rate` (по action)
- `suspected_bot_session_rate`
- `enforcement_level_distribution`
- `appeal_rate` и `appeal_success_rate`

---

## 8) Acceptance checklist

Готово, если:
- есть trust score + tiers
- есть enforcement state machine E0..E5
- есть таблица лимитов по tier
- есть anomaly flags
- trust влияет на trends/ranking
- appeals доступны и измеримы
- UI ограничений соответствует D0.000
