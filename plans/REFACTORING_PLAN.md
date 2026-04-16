# REFACTORING PLAN — ECOMANSONI Code Quality Fixes

**Date:** 2026-04-15  
**Author:** Mansoni Core  
**Priority:** HIGH — Production Blocker

---

## Executive Summary

Current codebase violates core Mansoni standards:
- **VideoCallProvider.tsx** — 2000+ LOC (limit: 400) → 500% overflow
- **calls-ws/index.mjs** — 2000+ LOC (limit: 500) → 400% overflow
- **Mixed language** — Russian comments in English codebase
- **console.* usage** — violates CLAUDE.md "no console.log in production"

This plan fixes all violations while maintaining **100% functionality**.

---

## Phase 1: VideoCallProvider Refactoring (HIGH PRIORITY)

### Current State
- Single file: `src/contexts/video-call/VideoCallProvider.tsx`
- ~2000 lines (61 useState/useRef + complex E2EE logic)
- Mixed Russian/English comments
- Debug console.error on line 737

### Target Architecture
```
src/contexts/video-call/
├── VideoCallProvider.tsx      (150 LOC — composition only)
├── contexts/
│   ├── VideoCallSignalingContext.tsx   (200 LOC)
│   ├── VideoCallMediaContext.tsx       (200 LOC)
│   └── VideoCallUIContext.tsx          (100 LOC)
├── hooks/
│   ├── useCallsAuth.ts                  (100 LOC)
│   ├── useCallsE2EE.ts                  (200 LOC)
│   └── useCallsRekey.ts                 (150 LOC)
├── utils/
│   ├── callsConfig.ts                   (80 LOC)
│   ├── mediaHelpers.ts                  (100 LOC)
│   └── turnCredentials.ts               (80 LOC)
└── types/
    └── calls.ts                         (150 LOC)
```

### Step-by-Step Execution

#### 1.1 Extract types (NEW FILE)
**File:** `src/contexts/video-call/types/calls.ts`

Extract all interfaces and types currently embedded in VideoCallProvider:
- `CalleeProfile`
- `VideoCallSignalingContextType`
- `VideoCallMediaContextType`
- `VideoCallUIContextType`

**Lines to move:** ~100

#### 1.2 Extract configuration (NEW FILE)
**File:** `src/contexts/video-call/utils/callsConfig.ts`

Extract environment constants:
- `CALLS_V2_ENABLED`, `CALLS_V2_WS_URL`, `DEFAULT_PROD_SFU_ENDPOINTS`
- `TURN_CREDENTIALS_EDGE_FNS`, `TURN_REFRESH_BEFORE_EXPIRY_SEC`
- `REKEY_INTERVAL_MS`, `REQUIRE_SFRAME`, etc.

Also extract utility functions:
- `normalizeWsEndpoint()`
- `canonicalizeSfuHost()`
- `expandWsEndpoints()`
- `isLocalEndpoint()`
- `getCallsConfigIssue()`
- `getCallsConfigToastDescription()`
- `hasInsertableStreamsSupport()`
- `extractRouterCapsFromJoinPayload()`

**Lines to move:** ~150

#### 1.3 Extract media helpers (NEW FILE)
**File:** `src/contexts/video-call/utils/mediaHelpers.ts`

Extract media-related utilities:
- `hasTransportFingerprints()`
- `isValidTransportCreatedPayload()`
- `toBase64Utf8()` — NOTE: unused, mark for removal or keep only if needed
- `makeRandomB64()`
- `getMediaPermissionToastPayload()`
- `getCallsBootstrapToastPayload()`
- `isMediaErrorForCall()`

**Lines to move:** ~100

#### 1.4 Extract TURN credentials logic (NEW FILE)
**File:** `src/contexts/video-call/utils/turnCredentials.ts`

Extract `fetchTurnIceServers()` function from VideoCallProvider.

**Lines to move:** ~80

#### 1.5 Extract auth hooks (NEW FILE)
**File:** `src/contexts/video-call/hooks/useCallsAuth.ts`

Extract:
- `ensureCallsV2Connected()` — convert to hook
- Auth logic from VideoCallProvider

**Lines to move:** ~100

#### 1.6 Extract E2EE logic (NEW FILE)
**File:** `src/contexts/video-call/hooks/useCallsE2EE.ts`

Extract E2EE key exchange and media encryption logic:
- CallKeyExchange initialization
- CallMediaEncryption initialization
- EpochGuard management
- KEY_PACKAGE handling

**Lines to move:** ~200

#### 1.7 Extract rekey state machine (NEW FILE)
**File:** `src/contexts/video-call/hooks/useCallsRekey.ts`

Extract rekey machine logic:
- RekeyStateMachine initialization
- Rekey events handling
- Epoch transitions

**Lines to move:** ~150

#### 1.8 Rewrite VideoCallProvider composition
**File:** `src/contexts/video-call/VideoCallProvider.tsx`

Keep only:
- Imports from new modules
- Main component composition
- Context Providers composition
- State coordination between contexts

**Target:** ~150 LOC

#### 1.9 Fix language violations
**All new files:** English comments only

Convert existing Russian comments:
```
// Сколько секунд до истечения credentials → // Seconds before credentials expiry
// ИСПРАВЛЕНИЕ → // FIX
// Кэш TURN ICE-серверов → // TURN ICE servers cache
```

#### 1.10 Replace console.* with logger
Search all files for:
```bash
grep -rn "console\." src/contexts/video-call/
```

Replace:
```tsx
console.error("[DIAG:...]") → logger.error("[VideoCallContext] ...", ...)
console.log(...) → logger.debug(...)
```

---

## Phase 2: PostCard Refactoring (HIGH PRIORITY)

### Current State
- `src/components/feed/PostCard.tsx`
- 644 lines (limit: 400)
- 31 "defect #N" marker comments

### Target Architecture
```
src/components/feed/
├── PostCard.tsx                   (200 LOC — main component)
├── PostCard/
│   ├── CaptionText.tsx            (40 LOC)
│   ├── MediaCarousel.tsx          (150 LOC)
│   ├── PostActions.tsx            (60 LOC)
│   ├── PostHeader.tsx             (50 LOC)
│   └── PostFooter.tsx             (40 LOC)
└── index.ts                        (re-export)
```

### Step-by-Step Execution

#### 2.1 Extract CaptionText (NEW FILE)
**File:** `src/components/feed/PostCard/CaptionText.tsx`

Move memoized `CaptionText` component.
Remove "defect #31" comment — clean implementation.

**Lines:** ~40

#### 2.2 Extract MediaCarousel (NEW FILE)
**File:** `src/components/feed/PostCard/MediaCarousel.tsx`

Extract:
- Carousel state (currentImageIndex, aspect ratio)
- Touch handlers (onTouchStart, onTouchEnd)
- Swipe logic
- Image/video rendering
- Dots indicator

**Lines:** ~150

#### 2.3 Extract PostActions (NEW FILE)
**File:** `src/components/feed/PostCard/PostActions.tsx`

Extract:
- Like button with animation
- Comment button
- Share button
- Save button

**Lines:** ~60

#### 2.4 Extract PostHeader (NEW FILE)
**File:** `src/components/feed/PostCard/PostHeader.tsx`

Extract:
- Avatar with verification badge
- Username with pin indicator
- Paid partnership badge
- WhyRecommended component
- Location tag

**Lines:** ~50

#### 2.5 Extract PostFooter (NEW FILE)
**File:** `src/components/feed/PostCard/PostFooter.tsx`

Extract:
- Like summary text
- Caption rendering
- Time + reminder
- Comments/Shares count

**Lines:** ~40

#### 2.6 Rewrite PostCard composition
**File:** `src/components/feed/PostCard.tsx`

Keep:
- Props interface (still needed here)
- Imports from sub-components
- Main component orchestration
- Sheet management (CommentsSheet, LikesSheet, etc.)

**Target:** ~200 LOC

#### 2.7 Remove "defect #N" markers
All markers should be removed during extraction. If any remain, clean them:
```tsx
// ИСПРАВЛЕНИЕ дефекта #6 → Remove or convert to // memo prevents re-render
// ИСПРАВЛЕНИЕ дефекта #7 → Remove or convert to // rollback on error + toast
```

---

## Phase 3: calls-ws Refactoring (HIGH PRIORITY)

### Current State
- `server/calls-ws/index.mjs`
- ~2000 lines (limit: 500)
- Single monolithic file

### Target Architecture
```
server/calls-ws/
├── index.mjs                (150 LOC — server bootstrap)
├── config.mjs               (60 LOC — env parsing)
├── constants.mjs            (80 LOC — rate limits, codecs)
├── validators/
│   ├── envelope.mjs         (40 LOC)
│   ├── callInvite.mjs       (30 LOC)
│   └── callState.mjs        (30 LOC)
├── handlers/
│   ├── auth.mjs             (80 LOC)
│   ├── room.mjs             (150 LOC)
│   ├── callSignaling.mjs    (100 LOC)
│   ├── e2ee.mjs             (120 LOC)
│   └── rekey.mjs            (80 LOC)
├── middleware/
│   ├── rateLimit.mjs        (60 LOC)
│   ├── jwtGuard.mjs         (50 LOC)
│   └── ipLimit.mjs          (40 LOC)
├── store/
│   └── (existing)          (keep as is)
├── utils/
│   ├── deviceBinding.mjs    (50 LOC)
│   ├── joinTokens.mjs       (60 LOC)
│   └── messageDelivery.mjs  (50 LOC)
└── index.mjs                (entry point, imports handlers)
```

### Step-by-Step Execution

#### 3.1 Extract config (NEW FILE)
**File:** `server/calls-ws/config.mjs`

- PORT, NODE_ENV, ENV
- IS_PROD_LIKE
- DEBUG, MAX_PAYLOAD_BYTES
- All parseDotEnvFile, resolveSupabaseAuthEnv

**Lines:** ~60

#### 3.2 Extract constants (NEW FILE)
**File:** `server/calls-ws/constants.mjs`

- GATEWAY_DEFAULT_CODECS
- DEFAULT_RATE_LIMITS
- TRUSTED_PROXIES
- Device ID pattern
- TTL values (CALLS_JOIN_TOKEN_TTL_SEC, KEY_TTL_MS, DEDUP_TTL_MS)

**Lines:** ~80

#### 3.3 Extract validators (NEW FILE DIRECTORY)
**Directory:** `server/calls-ws/validators/`

**Files:**
- `envelope.mjs` — envelopeValidate
- `callInvite.mjs` — callInvitePayloadValidate  
- `callState.mjs` — callStatePayloadValidate

**Lines:** ~100 total

#### 3.4 Extract handlers (NEW DIRECTORY)
**Directory:** `server/calls-ws/handlers/`

**Files:**
- `auth.mjs` — AUTH, HELLO, E2EE_CAPS handlers
- `room.mjs` — ROOM_CREATE, ROOM_JOIN, ROOM_JOIN_OK
- `callSignaling.mjs` — call.invite, call.accept, call.decline, etc.
- `e2ee.mjs` — KEY_PACKAGE, KEY_ACK handling
- `rekey.mjs` — REKEY_BEGIN, REKEY_COMMIT

**Lines:** ~530 total

#### 3.5 Extract middleware (reuse from existing)
**Files:** Already have:
- `rateLimit.mjs` — exists
- `jwtGuard.mjs` — exists
- Add `ipLimit.mjs` — new, per-IP connection limiting

#### 3.6 Extract utils (NEW DIRECTORY)
**Directory:** `server/calls-ws/utils/`

**Files:**
- `deviceBinding.mjs` — normalizeDeviceId, bindConnectionDevice, unbindConnectionDevice
- `joinTokens.mjs` — issueJoinToken, verifyJoinToken, encodeBase64Url, decodeBase64Url
- `messageDelivery.mjs` — deliverToUserDevices, send, ack

**Lines:** ~160 total

#### 3.7 Rewrite index.mjs composition
**File:** `server/calls-ws/index.mjs`

Keep:
- HTTP server setup (health endpoint)
- WebSocket server bootstrap
- Connection handling orchestration
- Imports from modules

**Target:** ~150 LOC

---

## Phase 4: Verification (BLOCKING)

### 4.1 TypeScript Check
```bash
npm run typecheck
# Must output: No errors
```

If errors → Fix immediately, do not proceed.

### 4.2 Run Tests
```bash
# Acceptance tests
npm run test:acceptance

# Chaos tests  
npm run test:chaos

# Full test suite
npm run test:core
```

All must pass.

### 4.3 Manual Verification
- [ ] Video call initiates correctly
- [ ] PostCard renders in feed
- [ ] calls-ws starts without errors
- [ ] E2EE key exchange works

---

## Timeline

| Phase | Estimated Time | Dependencies |
|-------|---------------|--------------|
| Phase 1: VideoCallProvider | 2-3 hours | None |
| Phase 2: PostCard | 1-2 hours | None |
| Phase 3: calls-ws | 2-3 hours | Phase 1-2 optional |
| Phase 4: Verification | 30 min | All phases complete |

**Total:** ~6-8 hours

---

## Success Criteria

| Metric | Before | After |
|--------|--------|-------|
| VideoCallProvider LOC | ~2000 | ~150 |
| calls-ws/index.mjs LOC | ~2000 | ~150 |
| PostCard.tsx LOC | 644 | ~200 |
| Language violations | 50+ Russian comments | 0 |
| console.* usage | 5+ occurrences | 0 |
| Files over limit | 3 | 0 |

---

## Rollback Plan

If issues arise during refactoring:

1. **Git stash** before each phase:
   ```bash
   git stash push -m "refactor: before VideoCallProvider split"
   ```

2. **Test after each extraction** — if functionality breaks, revert:
   ```bash
   git stash pop
   ```

3. **Run typecheck + tests** after each file change

---

## Notes

- **No breaking changes** — all refactoring is internal reorganization
- **Maintain all functionality** — E2EE, calls, feed must work identically
- **Use existing logger** — `src/lib/logger` already imported in VideoCallProvider
- **Follow naming conventions** — camelCase for files (e.g., `callsConfig.ts`)
- **Default export** for all new modules for cleaner imports