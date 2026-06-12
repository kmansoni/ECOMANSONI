# Multi-Account Layer: IRON RULES (Архитектурный контракт)

**Дата:** 2026-02-21  
**Статус:** MANDATORY для всех изменений в multi-account flow

---

## 1. DATA CONTRACT (Явный контракт данных)

### ✅ ПРАВИЛО 1.1: Explicit Profile Fields
```
profiles table SELECT MUST include:
  - user_id (PK, string)
  - username (NOT NULL, string, max 32, unique)
  - display_name (optional, string)
  - avatar_url (optional, string URL or NULL)
```

**Enforceable:** SQL migration enforces NOT NULL constraint on username  
**Validation:** TypeScript interface AccountProfileSnapshot must have explicit fields with no `??` for identification

### ✅ ПРАВИЛО 1.2: NO FALLBACK для идентификационных полей
```typescript
// ❌ FORBIDDEN:
username: username || deriveUsernameFromDisplayName(displayName) || "user"
avatarUrl: avatarUrl || "https://i.pravatar.cc/150?img=32"

// ✅ REQUIRED:
if (!username) throw new Error('MISSING_USERNAME_FROM_PROFILE');
if (!avatarUrl) use deterministic hash of userId;
```

**Impact:** Breaks early if profile is incomplete, prevents silent degradation

---

## 2. ERROR STATES (Явная обработка ошибок)

### ✅ ПРАВИЛО 2.1: requiresReauth MUST be visualized
```
Drawer.tsx MUST show:
  - ❌ Red indicator if account.requiresReauth === true
  - Tooltip: "Требуется переаутентификация"
  - Disabled account switch until fixed
```

**Validation:** Jest test checks drawer renders reauth indicator

### ✅ ПРАВИЛО 2.2: Profile timeout is ERROR, not silent retry
```
fetchMyProfileSnapshot timeout (5s) MUST:
  - Log error with timestamp + accountId
  - Trigger retry loop ONLY via explicit retryProfileFetch()
  - Never silently degrade to "user" / fallback icon
  - Update account.lastProfileErrorAt in index
```

**Impact:** Broken profile loads become observable and actionable

---

## 3. ORDERING & VISUAL CONSISTENCY

### ✅ ПРАВИЛО 3.1: Active account ALWAYS first in drawer
```typescript
const sortedAccounts = [
  accounts.find(a => a.accountId === activeAccountId), // Always at [0]
  ...accounts.filter(a => a.accountId !== activeAccountId).sort(...)
].filter(Boolean)
```

**Safety:** No UX confusion about "which account is active"

### ✅ ПРАВИЛО 3.2: Deterministic avatar per account
```
If avatarUrl missing:
  hash = SHA1(userId).slice(0,8)
  imgId = parseInt(hash, 16) % 70
  avatar = `https://i.pravatar.cc/150?img=${imgId}`
```

**Guarantee:** Same userId → same fallback avatar every time (no reroll per render)

---

## 4. OBSERVABILITY & LOGGING

### ✅ ПРАВИЛО 4.1: Debug logging gated by FLAG_DEBUG
```typescript
const FLAG_DEBUG = process.env.VITE_DEBUG_MULTI_ACCOUNT === 'true';

// ✅ Use this pattern:
if (FLAG_DEBUG) console.log("🔵 [fetchMyProfileSnapshot]", { accountId, duration });

// ❌ FORBIDDEN in production:
console.log("...") without flag check
```

**Impact:** No console spam in production, safe for CI/CD

### ✅ ПРАВИЛО 4.2: Linting rule: no bare console.log in MultiAccountContext
```json
{
  "rules": {
    "no-console": ["error", { "allow": ["error", "warn"] }]
  }
}
```

**Enforcement:** ESLint must prevent accidental logs

---

## 5. ASYNC FLOWS & RACE CONDITIONS

### ✅ ПРАВИЛО 5.1: onAuthStateChange NEVER waits for profile
```typescript
// ✅ CORRECT:
setAccounts(upsertAccountIndex({ accountId, profile: undefined }));
void (async () => {
  const profile = await fetchMyProfileSnapshot(accountId);
  // ...update separately
})();

// ❌ FORBIDDEN:
const profile = await fetchMyProfileSnapshot(accountId); // Blocks session init
```

**Safety:** Auth session is instant, profile loads async (non-blocking)

### ✅ ПРАВИЛО 5.2: switchAccount uses switchMutexRef
```
Only one switchAccount can run at a time.
If already switching, await previous switch before starting new one.
```

**Impact:** No race condition if user rapidly clicks different accounts

### ✅ ПРАВИЛО 5.3: retryProfileFetch uses exponential backoff
```
Retry delays: [1000ms, 2000ms, 4000ms, 8000ms] (4 attempts max)
MaxAge: stop if profile is older than configured max age (undefined = forever)
```

**Impact:** Transient timeouts recover automatically, but don't pound server

---

## 6. CODE HYGIENE

### ✅ ПРАВИЛО 6.1: Dead code MUST be removed
```
Files to DELETE (мертвый код, не импортируется):
  - src/components/profile/AccountSwitcher.tsx 
    * Использует mockAccounts
    * Не импортируется в App.tsx
    * Содержит console.log("Add account")
    * Дублирует логику из BottomNav.tsx
    
Verification: grep -r "from.*AccountSwitcher" src/ → 0 matches (✅ confirmed unused)
```

**Action:** Delete using `rm src/components/profile/AccountSwitcher.tsx` or via VS Code file explorer  
**Impact:** Single source of truth for account switching

### ✅ ПРАВИЛО 6.2: No duplicate implementations
```
"Account Switching" must exist in exactly ONE place:
  - MultiAccountContext.tsx (state + logic)
  - BottomNav.tsx (UI drawer)
  
No AccountSwitcher.tsx variant with mock data.
```

---

## 7. VALIDATION CHECKPOINTS

### ✅ TypeScript checks
```bash
npx tsc --noEmit --strict
```
Must pass before commit.

### ✅ Test coverage
```bash
npm test -- MultiAccountContext
npm test -- BottomNav
```
Must pass. No skipped tests.

### ✅ No broken auth flow
```
1. User logs in → session active ✓
2. Profile loads async → account updated ✓
3. Switch to different account → new session + new profile ✓
4. Profile timeout → error state visible ✓
5. Manual retry → exponential backoff ✓
```

---

## 8. BREAKING RULES = UNDEFINED BEHAVIOR

**If you:**
- Add `username ?? "user"`
- Don't gate console.log
- Silently fallback avatarUrl without hash
- Keep AccountSwitcher.tsx with mock data
- Block onAuthStateChange on profile fetch
- Don't visualize requiresReauth

**Then:**
- Silent data loss (username degradation)
- Console spam in production
- Visual confusion (same avatar for different users)
- Maintenance burden (wrong copy-paste target)
- Race conditions in auth flow
- Hidden errors go unreported

---

## Summary

| Rule | Category | Violation Impact |
|------|----------|-----------------|
| 1.1, 1.2 | Data Contract | Silent user degradation, illusory correctness |
| 2.1, 2.2 | Error States | Hidden failures, bad UX diagnosis |
| 3.1, 3.2 | Visual Consistency | Confusion about active account |
| 4.1, 4.2 | Observability | Production noise, undebuggable issues |
| 5.1, 5.2, 5.3 | Async Safety | Race conditions, service overload |
| 6.1, 6.2 | Code Hygiene | Maintainability risk, copy-paste bugs |

**Non-negotiable:** Rules 1.1, 1.2, 2.1, 5.1, 6.1 — these are architectural.

---

## Next Steps

Phase 1 (In-progress):
- [ ] Implement Rule 1.1: Ensure profiles.username is NOT NULL
- [ ] Implement Rule 1.2: Throw if username/avatar missing (no fallback)
- [ ] Implement Rule 2.1: Visual requiresReauth indicator
- [ ] Implement Rule 3.1: Active account always first
- [ ] Implement Rule 4.1, 4.2: Debug logging with FLAG_DEBUG
- [ ] Implement Rule 5.3: retryProfileFetch loop with backoff
- [ ] Implement Rule 6.1: Delete unused AccountSwitcher.tsx

Phase 2 (After Phase 1 validation):
- [ ] Add integration test for full account switch flow
- [ ] Add visual test for drawer with requiresReauth state
- [ ] Smoke test: rapid account switches don't deadlock
