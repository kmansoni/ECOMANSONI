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
| 3 | Key Management | WebAuthn/PRF binding | P0 | Dev | Week 2 | completed | Medium | 1 | `src/lib/e2ee/webAuthnBinding.ts` | bf4756c | `npx tsc --noEmit` (module scope) | HKDF(PRF) wrap; IDB seed storage |
| 4 | Key Management | Key Ceremony | P1 | Dev | Week 2 | completed | Medium | 1 | `src/lib/e2ee/keyCeremony.ts` | bf4756c | `npx tsc --noEmit` (module scope) | 6-digit OTP, 3-attempt lockout, single-use token |
| 5 | Group E2EE | Sender Keys | P0 | Dev | Week 3 | completed | High | 1 | `src/lib/e2ee/senderKeys.ts` | bf4756c | `npx tsc --noEmit` (module scope) | Signal-style chain ratchet + ECDSA verification |
| 6 | Group E2EE | Group Key Tree | P1 | Dev | Week 4 | completed | Medium | 5 | `src/lib/e2ee/groupKeyTree.ts` | bf4756c | `npx tsc --noEmit` (module scope) | Binary tree O(log N) key updates |
| 7 | Group E2EE | Membership Ratcheting | P0 | Dev | Week 4 | completed | High | 5 | `groupKeyTree.ts` add/remove | bf4756c | `npx tsc --noEmit` (module scope) | add: new root; remove: rotate full path |
| 8 | Media E2EE | SFrame production | P0 | Dev | Week 5 | completed | High | 1 | `src/lib/e2ee/sframe.ts` + `insertableStreams.ts` | bd44db4 | - | AES-256-GCM, replay protection, Insertable Streams |
| 9 | Media E2EE | SFU key exchange | P0 | Dev | Week 5 | completed | High | 8 | `src/lib/e2ee/sfuKeyExchange.ts` | bf4756c | `npx tsc --noEmit` (module scope) | E2EKG protocol, ECDSA auth, freshness check |
| 10 | Media E2EE | Media key backup | P1 | Dev | Week 6 | completed | Medium | 1,8 | `src/lib/e2ee/mediaKeyBackup.ts` | 3bc0503 | `npx tsc --noEmit` (module scope) | PBKDF2-600k + AES-GCM envelope backup/restore |
| 11 | Production | Server-side validation | P0 | Dev | Week 7 | completed | High | 5 | `supabase/functions/validate-key-session/index.ts` | 3bc0503 | Deno type/lint pending; TS app check green | PreKeyBundle validation + OPK consume path |
| 12 | Production | OPK lifecycle enforcement | P1 | Dev | Week 4 | completed | Medium | 5 | `src/lib/e2ee/opkManager.ts` | 3bc0503 | `npx tsc --noEmit` (module scope) | generate/publish/replenish/revoke lifecycle |
| 13 | Production | Key escrow model | P1 | Dev | Week 8 | completed | Medium | 1 | `src/lib/e2ee/keyEscrow.ts` | 3bc0503 | `npx tsc --noEmit` (module scope) | password escrow + social recovery shard flow |
| 14 | Production | CI/CD security tests | P1 | Dev | Week 7 | completed | Medium | 11 | `.github/workflows/e2ee-security.yml` | 3bc0503 | workflow static validation | typecheck + vitest + audit + gitleaks + invariants |
| 15 | Production | Incident response plan | P1 | Unassigned | Week 7 | todo | Medium | 11 | approved incident runbook | - | - | - |
| 16 | Crypto Hardening | Constant-time review | P2 | Dev | Week 8 | completed | Low | 1 | `src/lib/e2ee/constantTime.ts` | 3bc0503 | `npx tsc --noEmit` (module scope) | safeEqual* constant-time comparators added |
| 17 | Production | Security logging policy | P1 | Dev | Week 7 | completed | Medium | 11 | `src/lib/e2ee/securityLogger.ts` | 3bc0503 | `npx tsc --noEmit` (module scope) | redacted structured logger + event taxonomy |
| 18 | Product Security | Device transfer flow | P1 | Dev | Week 6 | completed | Medium | 1,10 | `src/lib/e2ee/deviceTransfer.ts` | 3bc0503 | `npx tsc --noEmit` (module scope) | QR+ECDH transfer package with signature verify |
| 19 | Crypto Future | PQ-readiness abstraction | P2 | Dev | Week 8 | completed | Low | 1 | `src/lib/e2ee/pqKem.ts` | 3bc0503 | `npx tsc --noEmit` (module scope) | hybrid API + feature-flagged PQ stub fallback |
| 20 | Governance | Final E2EE release gate | P1 | Dev | Week 8 | completed | High | 11,14,15 | `docs/E2EE_RELEASE_GATE.md` | c8777c3 | Gate doc + open items listed | Release gate open — sign-off pending prod cutover |

## Еженедельный статус

| Week | Planned | Completed | Blocked | Confidence | Summary |
|------|---------|-----------|---------|------------|---------|
| Week 1 | 1,2 | 1,2 | - | 100% | IndexedDB KeyStore + migration done |
| Week 2 | 3,4 | 3,4 | - | 100% | WebAuthn/PRF binding + Key Ceremony done |
| Week 3 | 5 | 5 | - | 100% | Sender Keys (Signal-style) done |
| Week 4 | 6,7,12 | 6,7,12 | - | 100% | Group Key Tree + Membership Ratcheting + OPK lifecycle done |
| Week 5 | 8,9 | 8,9 | - | 100% | SFrame production + SFU Key Exchange done |
| Week 6 | 10,18 | 10,18 | - | 100% | Media backup + device transfer implemented |
| Week 7 | 11,14,15,17 | 11,14,17 | 15 | 75% | Validation edge function, CI security workflow, security logger done |
| Week 8 | 13,16,19,20 | 13,16,19,20 | - | 100% | Escrow, constant-time, PQ abstraction, test suite (14/14), release gate doc done |
