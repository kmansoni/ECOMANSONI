# E2EE Release Sign-off Checklist

Цель: формальная проверка готовности E2EE к production rollout.

## Инструкция по использованию

- Каждый пункт должен иметь Owner, дату и ссылку на доказательство.
- Любой незакрытый Critical пункт автоматически означает No-Go.
- Решение по релизу фиксируется в конце документа.

## 1. Cryptography Correctness

| Check | Severity | Owner | Status | Evidence |
|-------|----------|-------|--------|----------|
| X3DH test suite green | Critical | Unassigned | pending | - |
| Double Ratchet test suite green | Critical | Unassigned | pending | - |
| Message replay protection validated | High | Unassigned | pending | - |
| Key rotation does not break decryption | High | Unassigned | pending | - |
| No weak algorithms used | Critical | Unassigned | pending | - |

## 2. Key Management Security

| Check | Severity | Owner | Status | Evidence |
|-------|----------|-------|--------|----------|
| No E2EE key material in localStorage | Critical | Unassigned | pending | - |
| Key storage enforces non-extractable keys | Critical | Unassigned | pending | - |
| WebAuthn or equivalent unlock flow validated | High | Unassigned | pending | - |
| Key migration path tested with rollback | High | Unassigned | pending | - |
| Key ceremony for critical operations enabled | High | Unassigned | pending | - |

## 3. Group E2EE Readiness

| Check | Severity | Owner | Status | Evidence |
|-------|----------|-------|--------|----------|
| Sender Keys implemented and tested | Critical | Unassigned | pending | - |
| Membership rekey on add/remove works | Critical | Unassigned | pending | - |
| Late joiners cannot decrypt past messages | High | Unassigned | pending | - |
| Removed members cannot decrypt new messages | Critical | Unassigned | pending | - |
| OPK lifecycle enforcement verified | High | Unassigned | pending | - |

## 4. Media E2EE Readiness

| Check | Severity | Owner | Status | Evidence |
|-------|----------|-------|--------|----------|
| SFrame encryption on outgoing media | Critical | Unassigned | pending | - |
| SFrame decryption on incoming media | Critical | Unassigned | pending | - |
| SFU has no plaintext access | Critical | Unassigned | pending | - |
| Rekey flow during active calls validated | High | Unassigned | pending | - |
| Media key backup and restore validated | Medium | Unassigned | pending | - |

## 5. Server and Platform Controls

| Check | Severity | Owner | Status | Evidence |
|-------|----------|-------|--------|----------|
| Server-side prekey/session validation active | Critical | Unassigned | pending | - |
| Rate limits for key endpoints configured | High | Unassigned | pending | - |
| Security logs redact secret data | Critical | Unassigned | pending | - |
| CI/CD security pipeline green | High | Unassigned | pending | - |
| Incident response runbook approved | High | Unassigned | pending | - |

## 6. Operational Gate

| Check | Severity | Owner | Status | Evidence |
|-------|----------|-------|--------|----------|
| Full test suite green in CI | Critical | Unassigned | pending | - |
| No unresolved Critical vulnerabilities | Critical | Unassigned | pending | - |
| Security review completed | Critical | Unassigned | pending | - |
| Product and engineering sign-off complete | High | Unassigned | pending | - |
| Rollback plan validated | High | Unassigned | pending | - |

## Release Decision

- Date: -
- Release Type: -
- Decision: Go / No-Go
- Critical blockers (if any): -
- Approved by: -
