# Multi-Account UX Fixes — Iron Rules

## Status: Phase 1 (Fixes 1-3) ✅ Applied | Phase 2 (Fix 4) ⚙️ In Progress

---

## **FIX 1: Username Fallback** ✅
**Status:** Applied to `snapshotFromProfileRow()`
- Changed from: `username: deriveUsernameFromDisplayName(displayName)` (always fallback)
- Changed to: `username: username || deriveUsernameFromDisplayName(displayName)` (try real first)
- **Files Modified:** `src/contexts/MultiAccountContext.tsx` (line 62)
- **No Breaking Changes:** ✅ Fallback still works for old profiles without `username` field
- **Tests Affected:** None (profile loading already tested in critical-paths.test.ts)

---

## **FIX 2: Profile Query** ✅
**Status:** Applied to `fetchMyProfileSnapshot()`
- Changed from: `.select("user_id, display_name, avatar_url, updated_at")`
- Changed to: `.select("user_id, display_name, avatar_url, username, updated_at")`
- **Files Modified:** `src/contexts/MultiAccountContext.tsx` (line 79)
- **No Breaking Changes:** ✅ New field is optional, old profiles will return null for username
- **Database Impact:** None (username column already exists in profiles table)

---

## **FIX 3: Avatar Determinism** ✅
**Status:** Applied to BottomNav drawer
- Changed from: `https://i.pravatar.cc/150?img=32` (fixed for all accounts)
- Changed to: Hash-based `img=${abs(hash(accountId)) % 70}` (unique per account)
- **Files Modified:** `src/components/layout/BottomNav.tsx` (line 354)
- **No Breaking Changes:** ✅ Real avatarUrl still takes priority
- **UX Impact:** Multiple accounts no longer look identical when missing avatar

---

## **FIX 4: Profile Retry Loop** ⚙️ IN PROGRESS
**Status:** Design Phase
**Implementation Plan:**

### **Core Rule: Retry ONLY on First Fetch Failure, NOT on Every Call**
- Implement inside `fetchMyProfileSnapshot()` as **local retry loop** (not separate function)
- Add `retryAttempt` parameter (0-3): `fetchMyProfileSnapshot(accountId, retryAttempt = 0)`
- On failure (`error` OR `!data`), check if `retryAttempt < 3`, then retry with backoff
- **Never await retry from auth/addAccount flows** → use `void` or `.catch(ignore)`

### **Iron Rules (MUST NOT violate):**

**1. Timeout Preservation**
- Original 5000ms timeout is for INITIAL fetch (attempt 0)
- Each retry attempt gets same 5000ms timeout (total: up to 20s with 3 retries)
- Never increase total wait time beyond 20s

**2. Retry Conditions (only retry on)**
- Initial fetch returned `error` OR `!data` (profile not found)
- Response time < 5000ms (timeout was not the issue)
- Never retry on `timeout` error (already backed off, bail)
- Never retry on authentication errors (403/401)

**3. Backoff Timing**
- Attempt 1 (after 0ms fail): Wait 500ms, then retry
- Attempt 2 (after 500ms fail): Wait 1000ms, then retry
- Attempt 3 (after 1500ms fail): Wait 2000ms, then retry
- Total max wait time: 500 + 1000 + 2000 = 3500ms (well under 20s)

**4. Non-Blocking Behavior**
- Never `await fetchMyProfileSnapshot()` in auth flow for retry
- Exception: In `addAccountWithPassword()` / `startAddAccountPhoneOtp()` - these can await
- In `onAuthStateChange()` - MUST use `void` (async fire-and-forget)
- Retry failure silently updates account index, does NOT throw

**5. Account Isolation**
- Store retrying `accountId` locally to compare
- If user switches account mid-retry, abort retry and start fresh for new account
- Use AbortSignal or manual flag to implement

**6. Logging Rules**
- Keep existing console.log calls unchanged (line 72, 90, 94, 97)
- Add NEW logs only for retry attempts: `[retry-N] Retrying fetch...` (debug level)
- Final failure: `[exhausted] Max retries, will use fallback`

**7. Database Load Protection**
- Total max queries = 4 (1 initial + 3 retries per account)
- Max concurrent: 1 per accountId (serialize attempts)
- No jitter required (simple exponential backoff sufficient)

**8. No Side Effects on Globals**
- Local variable `retryAttempt` only
- No new state refs in Component
- No changes to vault.ts, useProfile, other hooks
- Only modify `fetchMyProfileSnapshot()` signature

---

## **Validation Checklist Before Merge:**

- [ ] Fix 1-3 applied and npm test passes (58/58)
- [ ] Fix 4 implemented with retry inside `fetchMyProfileSnapshot()`
- [ ] No `await` on profile fetch in `onAuthStateChange()` (remains `void`)
- [ ] Await on profile fetch in add-account flows preserved (lines 302, 337, 415)
- [ ] Existing timeouts unchanged (5000ms)
- [ ] Max 4 total fetch attempts per profile (1 + 3 retries)
- [ ] Retry failures fall back gracefully to "user" / "Аккаунт" / deterministic avatar
- [ ] No changes to Supabase table schema
- [ ] Tests still pass: `npm test`
- [ ] Smoke test (manual): Switch accounts, slow network, no errors

---

## **Return to Baseline if Issues:**
If profile retry causes test failures or UX regression:
1. Revert `fetchMyProfileSnapshot()` to original (remove retry + retryAttempt param)
2. Keep fixes 1-3 (username, profile query, avatar) — these are safe
3. Log issue and revisit retry design

---
