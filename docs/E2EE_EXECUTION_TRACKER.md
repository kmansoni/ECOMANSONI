# E2EE Execution Tracker

Цель: рабочий трекер для исполнения roadmap по E2EE с прозрачным ownership, сроками и рисками.

## Правила обновления

- Обновлять статус минимум 2 раза в неделю.
- Любая задача со статусом blocked должна иметь явный blocker и owner на снятие блокера.
- Для каждой completed задачи должен быть указан PR, дата и результат тестов.

## Статусы

- todo
- in_progress
- blocked
- review
- completed

## Трекер задач

| Task ID | Workstream | Task | Priority | Owner | ETA | Status | Risk | Dependencies | Deliverable | PR/Commit | Test Evidence | Notes |
|---------|------------|------|----------|-------|-----|--------|------|--------------|-------------|-----------|---------------|-------|
| 1 | Key Management | IndexedDB KeyStore | P0 | Dev | Week 1 | completed | High | - | `src/lib/e2ee/keyStore.ts` | bd44db4 | e2ee-key-distribution-retry.test.ts | IDB + memory fallback + auto-migration |
| 2 | Key Management | localStorage migration | P0 | Dev | Week 1 | completed | High | 1 | `_migrateLegacyIfNeeded()` in keyStore.ts | bd44db4 | - | Migrates from `e2ee-keystore` → `e2ee-keystore-v2` |
| 3 | Key Management | WebAuthn/PRF binding | P0 | Dev | Week 2 | completed | Medium | 1 | `src/lib/e2ee/webAuthnBinding.ts` | pending | - | HKDF(PRF) wrap; IDB seed storage |
| 4 | Key Management | Key Ceremony | P1 | Dev | Week 2 | completed | Medium | 1 | `src/lib/e2ee/keyCeremony.ts` | pending | - | 6-digit OTP, 3-attempt lockout, single-use token |
| 5 | Group E2EE | Sender Keys | P0 | Dev | Week 3 | completed | High | 1 | `src/lib/e2ee/senderKeys.ts` | pending | - | Signal-style chain ratchet + ECDSA verification |
| 6 | Group E2EE | Group Key Tree | P1 | Dev | Week 4 | completed | Medium | 5 | `src/lib/e2ee/groupKeyTree.ts` | pending | - | Binary tree O(log N) key updates |
| 7 | Group E2EE | Membership Ratcheting | P0 | Dev | Week 4 | completed | High | 5 | `groupKeyTree.ts` add/remove | pending | - | add: new root; remove: rotate full path |
| 8 | Media E2EE | SFrame production | P0 | Dev | Week 5 | completed | High | 1 | `src/lib/e2ee/sframe.ts` + `insertableStreams.ts` | bd44db4 | - | AES-256-GCM, replay protection, Insertable Streams |
| 9 | Media E2EE | SFU key exchange | P0 | Dev | Week 5 | completed | High | 8 | `src/lib/e2ee/sfuKeyExchange.ts` | pending | - | E2EKG protocol, ECDSA auth, freshness check |
| 10 | Media E2EE | Media key backup | P1 | Unassigned | Week 6 | todo | Medium | 1,8 | encrypted backup/restore | - | - | - |
| 11 | Production | Server-side validation | P0 | Unassigned | Week 7 | todo | High | 5 | validation edge function + policies | - | - | - |
| 12 | Production | OPK lifecycle enforcement | P1 | Unassigned | Week 4 | todo | Medium | 5 | single-use OPK guarantees | - | - | - |
| 13 | Production | Key escrow model | P1 | Unassigned | Week 8 | todo | Medium | 1 | selected recovery model | - | - | - |
| 14 | Production | CI/CD security tests | P1 | Unassigned | Week 7 | todo | Medium | 11 | security workflow in CI | - | - | - |
| 15 | Production | Incident response plan | P1 | Unassigned | Week 7 | todo | Medium | 11 | approved incident runbook | - | - | - |
| 16 | Crypto Hardening | Constant-time review | P2 | Unassigned | Week 8 | todo | Low | 1 | audited compare paths | - | - | - |
| 17 | Production | Security logging policy | P1 | Unassigned | Week 7 | todo | Medium | 11 | sanitized structured logging | - | - | - |
| 18 | Product Security | Device transfer flow | P1 | Unassigned | Week 6 | todo | Medium | 1,10 | secure device re-enrollment | - | - | - |
| 19 | Crypto Future | PQ-readiness abstraction | P2 | Unassigned | Week 8 | todo | Low | 1 | feature-flagged hybrid interface | - | - | - |
| 20 | Governance | Final E2EE release gate | P1 | Unassigned | Week 8 | todo | High | 11,14,15 | signed release decision | - | - | - |

## Еженедельный статус

| Week | Planned | Completed | Blocked | Confidence | Summary |
|------|---------|-----------|---------|------------|---------|
| Week 1 | 1,2 | 1,2 | - | 100% | IndexedDB KeyStore + migration done |
| Week 2 | 3,4 | 3,4 | - | 100% | WebAuthn/PRF binding + Key Ceremony done |
| Week 3 | 5 | 5 | - | 100% | Sender Keys (Signal-style) done |
| Week 4 | 6,7,12 | 6,7 | - | 80% | Group Key Tree + Membership Ratcheting done; OPK pending |
| Week 5 | 8,9 | 8,9 | - | 100% | SFrame production + SFU Key Exchange done |
| Week 6 | 10,18 | - | - | - | - |
| Week 7 | 11,14,15,17 | - | - | - | - |
| Week 8 | 13,16,19,20 | - | - | - | - |
