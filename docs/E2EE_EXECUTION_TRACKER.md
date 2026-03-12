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
| 1 | Key Management | IndexedDB KeyStore | P0 | Unassigned | Week 1 | todo | High | - | keyStore implementation | - | - | - |
| 2 | Key Management | localStorage migration | P0 | Unassigned | Week 1 | todo | High | 1 | migration path + rollback | - | - | - |
| 3 | Key Management | WebAuthn/PRF binding | P0 | Unassigned | Week 2 | todo | Medium | 1 | hardware-bound unlock | - | - | - |
| 4 | Key Management | Key Ceremony | P1 | Unassigned | Week 2 | todo | Medium | 1 | critical operation confirmation flow | - | - | - |
| 5 | Group E2EE | Sender Keys | P0 | Unassigned | Week 3 | todo | High | 1 | sender-key encryption path | - | - | - |
| 6 | Group E2EE | Group Key Tree | P1 | Unassigned | Week 4 | todo | Medium | 5 | scalable key distribution | - | - | - |
| 7 | Group E2EE | Membership Ratcheting | P0 | Unassigned | Week 4 | todo | High | 5 | join/leave rekey protocol | - | - | - |
| 8 | Media E2EE | SFrame production | P0 | Unassigned | Week 5 | todo | High | 1 | stable encrypted media pipeline | - | - | - |
| 9 | Media E2EE | SFU key exchange | P0 | Unassigned | Week 5 | todo | High | 8 | secure key transport via SFU | - | - | - |
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
| Week 1 | - | - | - | - | - |
| Week 2 | - | - | - | - | - |
| Week 3 | - | - | - | - | - |
| Week 4 | - | - | - | - | - |
| Week 5 | - | - | - | - | - |
| Week 6 | - | - | - | - | - |
| Week 7 | - | - | - | - | - |
| Week 8 | - | - | - | - | - |
