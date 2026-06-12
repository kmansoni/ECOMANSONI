# P3C — RBAC Permission Matrix + Segregation of Duties

Дата: 2026-02-22

Цель: фиксировать “кто может что” для ключевых операций платформы.

Роли:
- user
- creator
- moderator
- admin
- super_admin
- service_role

---

## 1) Операции (минимальный набор)

### Config control-plane
- O1 propose_config
- O2 validate_config
- O3 activate_config
- O4 rollback_config

### Moderation
- O5 decision_allow
- O6 decision_restrict
- O7 decision_block
- O8 view_queue

### Enforcement
- O9 set_enforcement_level
- O10 view_trust_score

### Data access
- O11 view_PII
- O12 export_user_data (DSAR)
- O13 delete_user_data (DSAR)

---

## 2) Матрица

- user:
  - O1 ❌ O2 ❌ O3 ❌ O4 ❌
  - O5–O8 ❌
  - O9 ❌ O10 ❌
  - O11 ❌ O12 ✅ (только свои данные) O13 ✅ (только свои данные)

- creator:
  - как user

- moderator:
  - O8 ✅
  - O5–O7 ✅ (в рамках назначенного региона/категории)
  - O11 ❌
  - O12/O13 ❌

- admin:
  - O1 ✅ (service workflow) O2 ✅ O3 ✅ O4 ✅
  - O5–O8 ✅
  - O9 ✅ O10 ✅
  - O11 ограниченно ✅ (по audit)
  - O12/O13 ✅ (по DSAR процедурам)

- super_admin:
  - все ✅, но требует step-up auth + отдельный аудит

- service_role:
  - O1–O4 ✅
  - O5–O10 ✅
  - O11–O13 ✅ только в автоматизированных DSAR/ops джобах

---

## 3) SOD (segregation of duties)

- moderator не может выполнять O1–O4.
- операции O11–O13 всегда аудируются.
- super_admin действия требуют step-up.

---

## 4) Acceptance

Готово если:
- матрица принята и используется в админке/сервисах
- SOD правила enforced
- audit coverage 100% для O3/O4/O11–O13
