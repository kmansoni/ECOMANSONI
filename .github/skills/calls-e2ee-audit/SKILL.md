---
name: calls-e2ee-audit
description: "Calls E2EE security audit for calls-v2: ephemeral ECDH+HKDF+AES-KW key exchange, ECDSA signatures, SFrame transforms, rekey state machine. Use when: calls-v2, video calls encryption."
argument-hint: "[area: key-exchange | sframe | rekey | signatures | all]"
user-invocable: true
---

# Calls E2EE Audit - Video Calls End-to-End Encryption

Специализированный аудит E2EE для архитектуры calls-v2. Алгоритм: **ephemeral ECDH + HKDF + AES-KW wrap/unwrap** для key exchange, **ECDSA P-256** для signatures, **SFrame** для media encryption, **Rekey State Machine** для forward secrecy.

---

## 1. Архитектура calls-v2 E2EE

### Основные компоненты

```
src/calls-v2/
├── callKeyExchange.ts
├── callMediaEncryption.ts
├── rekeyStateMachine.ts
├── ecdsaIdentity.ts
├── epochGuard.ts
├── sfuMediaManager.ts
└── __tests__/
```

### Критические паттерны для аудита

| Компонент | Паттерн | Security требование |
|-----------|---------|---------------------|
| `CallKeyExchange` | ECDH → HKDF → AES-KW | Verify signature BEFORE ECDH (C-1) |
| `SFrameProcessor` | AES-GCM per frame | Non-extractable keys (H-1) |
| `DTLSHandler` | Epoch tracking | Monotonic epoch (C-5) |
| `MediaTransform` | Insertable Streams | Fail-closed on key missing (H-6) |

## 2. Grep patterns для поиска уязвимостей в calls-v2

```bash
# Signature verification order violations
grep -rn "deriveECDH" src/calls-v2/ --include="*.ts" -A5 | grep -B5 "verifySignature"

# Epoch rollback vulnerabilities
grep -rn "epoch" src/calls-v2/ --include="*.ts" | grep -v ">=" | grep -v "<="

# Weak PRNG in crypto context
grep -rn "Math.random|Date\.now" src/calls-v2/ --include="*.ts"

# Extractable key violations
grep -rn "extractable.*true|extractable: true" src/calls-v2/ --include="*.ts"

# Export key operations
grep -rn "exportKey|wrapKey" src/calls-v2/ --include="*.ts"

# Missing anti-replay checks
grep -rn "messageId" src/calls-v2/ --include="*.ts" | grep -v "eventLog|has|set"

# Hardcoded keys in calls-v2
grep -rn "privateKey.*=.*['\"]|secret.*=.*['\"]" src/calls-v2/ --include="*.ts"

# AES weak modes
grep -rn "AES-ECB|AES-CBC" src/calls-v2/ --include="*.ts"

# Storage in localStorage (insecure)
grep -rn "localStorage" src/calls-v2/ --include="*.ts"
```

## 3. Security requirements чеклист

### CRITICAL (блокируют выпуск)

- [ ] **C-1**: ECDSA signature verified BEFORE ECDH key derivation
- [ ] **C-2**: HKDF salt is random 32-byte, unique per exchange
- [ ] **C-3**: Nonces/nonceCounter never reused in SFrame
- [ ] **C-4**: AES-KW unwrap fails gracefully, no key leakage
- [ ] **C-5**: Epoch numbers strictly monotonic, rollback blocked

### HIGH (требуют исправления)

- [ ] **H-1**: All keys non-extractable (extractable: false)
- [ ] **H-2**: Keys stored in IndexedDB, not localStorage/sessionStorage
- [ ] **H-3**: messageId is UUID v4, duplicate detection implemented
- [ ] **H-4**: Forward secrecy: old epoch keys evicted on destroy()
- [ ] **H-5**: Timer cleanup: null checks before clear in rekey
- [ ] **H-6**: Media transforms throw on missing encryption key

### MEDIUM (рекомендуется)

- [ ] **M-1**: Signature format: IEEE P1363 raw (r||s), SHA-256
- [ ] **M-2**: Constant-time comparison for crypto operations
- [ ] **M-3**: No secrets in logs/error messages
- [ ] **M-4**: Peer identity bound to key fingerprint

### LOW (best practice)

- [ ] **L-1**: JSDoc documentation for all crypto functions
- [ ] **L-2**: Unit tests coverage > 90% for crypto module
- [ ] **L-3**: Integration tests for key exchange flow

## 4. Интеграция с другими skills

### e2ee-audit-specialist

```yaml
triggers:
  - file: src/calls-v2/*.ts
    patterns: ["sign", "verify", "derive", "wrap", "encrypt", "epoch", "rollback", "duplicate"]
shared_patterns:
  - "extractable.*true"
  - "Math.random()"
  - "AES-ECB|AES-CBC"
  - "exportKey"
```

### cryptographic-failures-audit

```yaml
extends: cryptographic-failures-audit
inherits_patterns:
  - CWE-327, CWE-326, CWE-321, CWE-330
additional_check:
  - name: "calls-v2-key-storage"
    pattern: "localStorage.*key|sessionStorage.*key"
    severity: "H-2 violation"
```

### Приоритет вызова skills

1. **cryptographic-failures-audit** — если найден weak PRNG/algorithm
2. **e2ee-audit** — если найдены signature/epoch нарушения
3. **calls-e2ee-audit** — для архитектурной валидации calls-v2

## 5. Диагностические workflow

### Workflow 1: Полный E2EE аудит сессии

```yaml
name: calls-e2ee-full-audit
steps:
  1: run: cryptographic-failures-audit#prng-check
  2: run: cryptographic-failures-audit#key-storage-check
  3: run: e2ee-audit#signature-order-check
  4: run: e2ee-audit#epoch-protection-check
  5: run: calls-e2ee-audit#calls-key-exchange-audit
  6: run: calls-e2ee-audit#media-transform-audit
  7: aggregate: all-findings → SECURITY_REPORT.md
```

### Workflow 2: Инкрементальная проверка (CI)

```yaml
name: calls-e2ee-ci-check
trigger: git push -- '*.ts' in src/calls-v2/
steps:
  1: grep_patterns: ["extractable.*true", "Math.random", "exportKey"]
  2: if_findings: run: e2ee-audit-specialist
  3: status: fail if CRITICAL findings
```

### Workflow 3: Реактивный аудит после инцидента

```yaml
name: calls-e2ee-incident-response
trigger: security-alert
steps:
  1: identify: affected component from alert metadata
  2: run: grep for pattern in src/calls-v2/{component}/
  3: correlate: with event log timestamps
  4: generate: incident-analysis.md
```

### Emergency playbook

| Инцидент | Действие | Команда |
|-----------|----------|---------|
| MitM подозрение | Проверить signature order | `grep -rn "deriveECDH" src/calls-v2/ -A3` |
| Key leak | Проверить extractable keys | `grep -rn "extractable.*true" src/calls-v2/` |
| Replay атака | Проверить messageId дедуп | `grep -rn "eventLog|has(" src/calls-v2/` |
| DoS через crypto | Проверить timer cleanup | `grep -rn "clearTimeout|setInterval" src/calls-v2/` |
```