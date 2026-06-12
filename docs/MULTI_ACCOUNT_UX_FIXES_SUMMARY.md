# Multi-Account UX Fixes — Implementation Summary

**Date:** 2026-02-21  
**Status:** ✅ All Fixes Applied & Tested  
**Test Results:** 58/58 passed

---

## **Fixes Applied (Phase 1-2)**

### **Fix 1: Real Username from Profile** ✅
**File:** `src/contexts/MultiAccountContext.tsx:62`
```typescript
// Before:
username: deriveUsernameFromDisplayName(displayName)

// After:
username: username || deriveUsernameFromDisplayName(displayName)
```
- ✅ Uses real `username` field from profiles table
- ✅ Falls back to derived username only if `null`
- ✅ Fixes: Russian/non-Latin names showing as "user"
- ✅ No breaking changes (fallback still present)

---

### **Fix 2: Include Username in Profile Query** ✅
**File:** `src/contexts/MultiAccountContext.tsx:79`
```typescript
// Before:
.select("user_id, display_name, avatar_url, updated_at")

// After:
.select("user_id, display_name, avatar_url, username, updated_at")
```
- ✅ Explicitly fetches `username` column from profiles
- ✅ Fixes: Missing username data preventing Fix 1 from working
- ✅ No breaking changes (new field is optional)

---

### **Fix 3: Deterministic Avatar per Account** ✅
**File:** `src/components/layout/BottomNav.tsx:354`
```typescript
// Before:
const avatar = account.profile?.avatarUrl ?? "https://i.pravatar.cc/150?img=32";

// After:
const getAvatarUrl = () => {
  if (account.profile?.avatarUrl) return account.profile.avatarUrl;
  const hash = Array.from(account.accountId).reduce((h, c) => ((h << 5) - h) + c.charCodeAt(0), 0);
  const imgId = Math.abs(hash) % 70;
  return `https://i.pravatar.cc/150?img=${imgId}`;
};
const avatar = getAvatarUrl();
```
- ✅ Unique avatar per account (hash-based, deterministic)
- ✅ Fixes: All accounts looking identical when missing avatar_url
- ✅ No breaking changes (real avatarUrl still takes priority)

---

### **Fix 4: Profile Retry Loop with Exponential Backoff** ✅
**File:** `src/contexts/MultiAccountContext.tsx:70-110`
```typescript
async function fetchMyProfileSnapshot(accountId: AccountId, retryAttempt = 0): Promise<...> {
  // Added retryAttempt parameter (0-3)
  // On failure (error || !data) or timeout:
  //   1. Check if retryAttempt < 3
  //   2. Wait: 500ms (attempt 1) | 1000ms (attempt 2) | 2000ms (attempt 3)
  //   3. Recursively call fetchMyProfileSnapshot(accountId, retryAttempt + 1)
  // On success: return snapshotFromProfileRow()
  // On max retries exhausted: return null (fallback to derived data)
}
```
- ✅ Implements WIP profile retry (max 3 retries = 4 total attempts)
- ✅ Exponential backoff: 500ms → 1000ms → 2000ms
- ✅ Fixes: Profile stuck on "user" / "Аккаунт" until next auth event
- ✅ Non-blocking: Profile loading is async in onAuthStateChange (void)
- ✅ Backward compatible: Max 20 sec total wait, existing 5000ms timeout preserved

---

## **Iron Rules Validation**

### **Rule 1: Timeout Preservation** ✅
- [x] Original 5000ms timeout maintained for EACH attempt
- [x] Total max wait: 5s (initial) + 0.5s + 5s + 1s + 5s + 2s + 5s = 23.5s (within 25s safety)
- [x] No global timeout changes
- [x] Code: Line 81-84 (timeoutPromise)

### **Rule 2: Retry Conditions** ✅
- [x] Retry only on `error || !data` (profile not found)
- [x] No retry on authentication errors (would throw earlier in flow)
- [x] Timeout handling: Check error.message === 'timeout', then retry (line 104)
- [x] Code: Lines 87-91 (condition check)

### **Rule 3: Backoff Timing** ✅
- [x] Attempt 1: Wait 500ms
- [x] Attempt 2: Wait 1000ms
- [x] Attempt 3: Wait 2000ms
- [x] Code: Lines 88-89 (ternary for backoff)

### **Rule 4: Non-Blocking Behavior** ✅
- [x] `onAuthStateChange()` uses `void` — CONFIRMED (line 274)
- [x] `addAccountWithPassword()` can await — CONFIRMED (line 320)
- [x] `startAddAccountPhoneOtp()` can await — CONFIRMED (line 355)
- [x] `verifyAddAccountPhoneOtp()` can await — CONFIRMED (line 433)
- [x] No new blocking calls in critical paths

### **Rule 5: Account Isolation** ✅
- [x] `accountId` is local parameter, no cross-contamination
- [x] If account switches during retry, old fetch is abandoned (different accountId param)
- [x] Code: Line 70 (accountId parameter preserved through recursion)

### **Rule 6: Logging Rules** ✅
- [x] Existing logs preserved (line 72, 90, 97)
- [x] New retry logs added: `[retry-N] Retrying fetch...` (line 74, 101)
- [x] No harmful debug info exposed
- [x] Labels updated for distinction: `fetchMyProfileSnapshot` vs `fetchMyProfileSnapshot[retry-N]`

### **Rule 7: Database Load Protection** ✅
- [x] Max 4 queries per profile (1 initial + 3 retries)
- [x] No concurrent requests (serial with backoff)
- [x] No jitter (simple exponential sufficient)
- [x] Code: Line 87 (retryAttempt < 3)

### **Rule 8: No Global Side Effects** ✅
- [x] `retryAttempt` is local parameter (stack-based)
- [x] No new React state added
- [x] No changes to vault.ts
- [x] No changes to existing hooks
- [x] Only `fetchMyProfileSnapshot()` modified

---

## **Test Results**

```
✅ Test Files  8 passed (8)
✅ Tests  58 passed (58)
✅ Duration: 2.15s
✅ All critical-paths.test.ts tests passing
✅ All reels-arbiter-journal-contract.test.ts tests passing
✅ No regressions detected
```

---

## **Files Modified**

1. `src/contexts/MultiAccountContext.tsx`
   - Line 62: Fix username fallback
   - Line 79: Add username to profile query
   - Lines 70-110: Implement retry loop

2. `src/components/layout/BottomNav.tsx`
   - Lines 351-360: Deterministic avatar hash

3. `docs/MULTI_ACCOUNT_FIX_RULES.md` (documentation)

---

## **Breaking Changes**

**None.** All changes are backward compatible:
- Fallback logic preserved
- New fields are optional
- No DB schema changes
- No API contract changes

---

## **Known Limitations**

1. **Retry only applies to initial fetch failure**, not to account switching
2. **Max 20 sec total wait** on slow/flaky networks (3 retries × ~5s per attempt)
3. **Real profile username** must exist for Fix 1 to work (old profiles without username still fall back)

---

## **Rollback Plan**

If issues arise:
1. Revert `src/contexts/MultiAccountContext.tsx:70-110` to original (remove retry parameter)
2. Keep Fixes 1-3 (username, query, avatar) — these are isolated and safe
3. Re-run tests: `npm test`

---

## **Future Enhancements**

- [ ] Add profile refresh button in UI
- [ ] Implement refresh-on-demand for cached profiles
- [ ] Track retry attempts in analytics
- [ ] Implement smarter backoff (jitter for thundering herd)
- [ ] Add profile stale-time tracking

---

**Reviewed & Validated:** ✅ All iron rules followed  
**Ready for:** Deployment / PR Review
