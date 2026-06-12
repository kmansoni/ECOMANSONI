# P3A — Scale & Resilience + Governance Spec (Phase 3)

Дата: 2026-02-22

Статус: Draft (проектирование)

Цель Phase 3: сделать платформу операционно зрелой:
- надёжность (SLO/SLA, алерты, incident process, DR),
- governance (RBAC, segregation of duties, audit),
- data governance (classification, retention, encryption),
- подготовка к multi-region (хотя бы read-path).

Входные спеки:
- Phase 0 observability: [docs/specs/phase0/P0F-observability-slo-killswitch.md](docs/specs/phase0/P0F-observability-slo-killswitch.md)
- Phase 1 rollouts/guardrails: [docs/specs/phase1/P1M-rollouts-guardrails-autorevert.md](docs/specs/phase1/P1M-rollouts-guardrails-autorevert.md)

---

## 0) Ненарушаемые правила

- Zero-trust: never trust client; service-to-service auth.
- Least privilege: минимальные права по ролям.
- Audit неизменяем: нельзя “стереть след”.

---

## 1) Disaster Recovery (DR)

### 1.1 RTO/RPO (целевые)
- RTO (восстановление сервиса): 2 часа
- RPO (потеря данных): 15 минут

### 1.2 Backup policy
- DB backups: каждые 15 минут (point-in-time) + daily full
- Storage metadata backup: daily
- Retention:
  - daily: 30 дней
  - monthly: 12 месяцев

### 1.3 DR drills
- ежеквартально: failover simulation
- ежемесячно: restore test на тестовом окружении

### 1.4 Acceptance
- `backup_restore_test_pass_rate` ≥ 99%
- `cross_region_failover_time_seconds` в пределах RTO

---

## 2) Data governance

### 2.1 Data classification
Классы:
- PII (личные данные)
- Sensitive (приватные коммуникации)
- Public (публичный контент)
- Operational logs
- Analytics

### 2.2 Retention policy
- Engagement raw events: 30–90 дней (зависит от стоимости)
- Aggregates: 12–24 месяца
- Upload originals: политика по продукту (минимум N дней)

### 2.3 Encryption
- in transit: всегда
- at rest: storage + DB
- key rotation: раз в 90 дней (или по инциденту)

---

## 3) RBAC + Segregation of Duties (SOD)

Роли:
- user
- creator
- moderator
- admin
- super_admin
- service_role (машинный)

SOD правила:
- moderator не может управлять финансами
- финансы (если есть payouts) отделены
- super_admin доступ ограничен и аудируется

Матрица (минимум Phase 3):
- кто может activate configs
- кто может block/unblock
- кто может менять rate limits
- кто может видеть PII

---

## 4) Immutable audit trail

### 4.1 Что аудировать
- config propose/validate/activate/rollback
- moderation decisions
- enforcement level changes
- admin impersonation (если есть)

### 4.2 Требования
- append-only
- tamper-evident (hash chain или WORM storage)
- доступ по RBAC

---

## 5) Multi-region (read-path first)

### 5.1 Стратегия
- write-path остаётся в primary region
- read-path (feed/playback metadata) кэшируется ближе к пользователю

### 5.2 Consistency
- feed может быть eventual consistent
- privacy/block enforcement must be correct (no stale leaks)

### 5.3 CDN
- media delivery только через CDN
- signed URLs

---

## 6) Ops maturity

### 6.1 Alerting
- по SLO (latency/errors)
- по безопасности (report spikes)
- по стоимости (storage/CDN/transcode anomalies)

### 6.2 Incident response
- P0–P3 процесс обязателен
- postmortem обязательный

---

## 7) Acceptance checklist

Готово если:
- DR планы и drills существуют
- data classification + retention заданы
- RBAC/SOD матрица определена
- audit trail неизменяем
- multi-region read-path стратегия определена
- CDN signed URLs обязательны
