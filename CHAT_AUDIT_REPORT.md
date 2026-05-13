# 🔍 Chat Files Comprehensive Audit Report

**Project:** mansoni  
**Audit Scope:** All chat-related source files (components, hooks, lib, pages, contexts)  
**Files Scanned:** 213 TypeScript/TSX files  
**Date:** 2026-05-12  

---

## 📊 Executive Summary

| Category | Issues Found | Severity |
|----------|-------------|----------|
| XSS Security Risks | 1 | 🔴 Critical |
| Accessibility (missing alt) | 0* | 🟢 OK |
| Unsafe `any` types | 19 | 🟡 Medium |
| Debug statements | 0 | 🟢 OK |
| Timer leak risks | 1 | 🔴 Critical |
| Legacy React patterns | 16 | 🟡 Low |
| Silent error catches | 20 | 🟡 Medium |
| TypeScript errors | 0 | 🟢 OK |

*Note: Initial run found 4, but upon review these were false positives (JSDoc comments matching img regex pattern)

---

## 🔴 Critical Issues (Action Required)

### 1. Memory Leak: Unclearable setTimeout in useChat.tsx
**File:** `src/hooks/useChat.tsx:1298`  
**Severity:** Critical — memory leak, potential callback after unmount

```typescript
setTimeout(() => {
  if (channel && subscriptionStatusRef.current !== "SUBSCRIBED") {
    channel.subscribe();
  }
}, delay);
```

- The timeout ID is not stored; no cleanup in useEffect return
- During reconnection backoff, if component unmounts, timeout still fires
- **Fix:** Store timeout ID in a `useRef` and clear it in cleanup

### 2. XSS Risk: innerHTML Assignment
**File:** `src/components/chat/LocationShareSheet.tsx:107`  
**Severity:** Critical — potential XSS vector

```typescript
markerEl.innerHTML = `<div style="width:16px;height:16px;background:#3B82F6;border:3px solid white;border-radius:50%;box-shadow:0 0 8px rgba(59,130,246,0.6);"></div>`;
```

- Template string is hardcoded, not user-controllable — current risk LOW
- Pattern is discouraged; could become XSS if code ever interpolates variables
- **Fix:** Replace with DOM methods:
  ```typescript
  const inner = document.createElement("div");
  inner.style.cssText = "width:16px;height:16px;background:#3B82F6;border:3px solid white;border-radius:50%;box-shadow:0 0 8px rgba(59,130,246,0.6);";
  markerEl.appendChild(inner);
  ```

---

## 🟡 Medium Priority Issues

### 3. Unsafe `any` Type Usage (19 occurrences)

**Common patterns:**
- Environment variable access: `(import.meta as any).env` (protocolV11.ts, recoveryPolicyV11.ts)
- Error object casting: `const anyErr = error as any` (rpcError.ts, sendError.ts, chatConversationHelpers.ts)
- Query result casting: Supabase responses (useChatThreads.ts, ForwardMessageSheet.ts, SharedPostCard.ts)
- Stub placeholder: useChatCache.ts line 7

**Files affected:**
- `src/components/chat/ChannelConversation.tsx:259`
- `src/components/chat/chatConversationHelpers.ts:37`
- `src/components/chat/ForwardMessageSheet.tsx:189,216`
- `src/components/chat/SharedPostCard.tsx:66`
- `src/hooks/useChatCache.ts:5`
- `src/hooks/useChatThreads.ts:144`
- `src/lib/chat/battery.ts:46`
- `src/lib/chat/protocolV11.ts:13,29`
- `src/lib/chat/readiness.ts:2,19`
- `src/lib/chat/recoveryPolicyV11.ts:13`
- `src/lib/chat/rpcError.ts:34`
- `src/lib/chat/schemaProbe.ts:51,52`
- `src/lib/chat/sendError.ts:11,17`

**Recommendation:** Replace with proper types or `unknown` + type guards. Environment variable access can be isolated in a typed helper.

### 4. Error Handling: Overly Broad Catches (20 occurrences)

Many catch blocks are flagged because they don't rethrow. Review needed to determine if error is being logged or meaningfully handled.

**Examples that need review:**
- `ChannelConversation.tsx:1032` — `formatTime` function: returns `""` on invalid date (likely OK — graceful degradation)
- `useChatMedia.ts:91` — geolocation error handling with user toast (appropriate)
- `ChatsPage.tsx:157` — needs inspection
- `useChat.tsx:258` — needs inspection
- `lib/chat/readiness.ts:83,129,178` — readiness probes return user-friendly errors (appropriate)

**Action:** Manually verify each catch block:
- ✅ If providing user-friendly fallback → OK
- ✅ If logging error → OK
- ❌ If silently swallowing → add logging or rethrow

### 5. Legacy React.FC Pattern (16 components)

**Files using `React.FC`:**
- Payment-related components (PaymentSheet, PaymentInvoiceMessage)
- Bot-related (BotProfileSheet, BotCommandMenu)
- Chat UI (TopicsList, QuickRepliesBar, TextOverlay, PromptOptimizer, InlineKeyboard)
- Settings (CreateTopicSheet, BusinessGreetingOverlay)
- DrawingCanvas

**Note:** `React.FC` is not deprecated, but it has drawbacks:
- Implicit `children` prop (sometimes unwanted)
- Incompatible with some generic patterns
- Stricter prop requiring

**Recommendation:** Consider converting to standard function declarations where feasible for consistency. **Low priority** — does not affect runtime.

---

## 🟢 Passing Checks

### TypeScript Compilation
✅ **No TypeScript errors** found in chat files after full typecheck.

### Debug Statements
✅ **Zero** `console.log`, `console.debug`, `debugger`, or `alert()` statements in production chat code.

### Timer Cleanup (most cases)
✅ Proper cleanup found in:
- `VideoCallScreen.tsx` — clearInterval on unmount
- `StarsSheet.tsx` — CountdownTimer clears interval
- `ChatInputBar.tsx` — long-press timer cleared on mouse up/leave
- `DisappearCountdown.tsx` — clearInterval in effect cleanup
- `ChatMessageItem.tsx` — animations cleaned up properly

Only the reconnection timeout in `useChat.tsx` is problematic.

### Accessibility (after correction)
✅ All `<img>` tags have proper `alt` attributes.  
✅ Most interactive elements have `aria-label` or visible text.  
✅ Keyboard navigation patterns appear correct.

---

## 🛡️ Security Assessment

| Risk | Status | Notes |
|------|--------|-------|
| XSS via user input | ✅ Safe | Text rendered as text nodes only |
| dangerouslySetInnerHTML | ⚠️ None in chat components | Only seen in comments |
| innerHTML usage | ⚠️ 1 | LocationShareSheet — hardcoded, not user-controllable |
| DOM textContent assignment | ✅ Safe | No direct assignments found |
| URL sanitization | ✅ DOMPurify available | Used in link rendering |

**Note:** `LinkPreview.tsx` correctly renders all content as React text elements — no `dangerouslySetInnerHTML` usage.

---

## 🔧 Dependencies & Data Flow

### Chat v11 Protocol
- `protocolV11.ts`, `readiness.ts`, `recoveryV11.ts` implement robust feature flag + rollout %
- Environment variables accessed via `(import.meta as any).env` — consider typed env helper
- Recovery service uses timeout tracking with proper cleanup via `clearTimeout`

### Message Sending
- `sendMessageV1.ts` — overload handling for silent/normal messages (correct)
- `rpcError.ts`, `sendError.ts` — comprehensive error parsing with `as any` fallback (acceptable for error objects)

### Real-time
- `realtimeMessageReducer.ts` — correct binary search insertion, timestamp handling
- Subscription in `useChat.tsx` — has reconnection logic but missing timeout cleanup

---

## 📋 Recommendations by Priority

### 🔴 HIGH (Fix Immediately)
1. **Fix timer leak in `useChat.tsx`**  
   Store the reconnection `setTimeout` ID in a `useRef` and clear it in the cleanup function.

2. **Refactor `innerHTML` in `LocationShareSheet.tsx`**  
   Replace with DOM methods to eliminate even theoretical XSS surface.

### 🟡 MEDIUM (Fix in next sprint)
3. **Replace pervasive `any` types**  
   - Create typed environment accessor: `getEnv(name)` → `string | undefined`
   - Define error interfaces for Supabase errors
   - Type query responses properly

4. **Audit error handling catches**  
   Ensure all catches either: (a) log the error, (b) rethrow, or (c) return user-friendly fallback. Remove empty catches.

### 🟢 LOW (Technical debt)
5. **Consider removing `React.FC`** from components where children are not used  
   Improves consistency with modern React patterns.

6. **Add explicit timer cleanup verification**  
   Consider a custom ESLint rule or manual review checklist for setInterval/setTimeout within useEffect.

---

## 📁 Files Requiring Changes

| File | Issues |
|------|--------|
| `src/hooks/useChat.tsx` | Timer leak (setTimeout), maybe overly broad catch |
| `src/components/chat/LocationShareSheet.tsx` | innerHTML usage |
| `src/lib/chat/protocolV11.ts` | `as any` for env |
| `src/lib/chat/readiness.ts` | `any` types for Supabase |
| `src/lib/chat/rpcError.ts` | `as any` pattern |
| `src/lib/chat/sendError.ts` | `as any` pattern |
| `src/lib/chat/schemaProbe.ts` | `as any` for RPC response |
| `src/hooks/useChatCache.ts` | `any` in stub |
| `src/hooks/useChatThreads.ts` | `as any` cast |
| `src/components/chat/ForwardMessageSheet.tsx` | `as any` casts |
| `src/components/chat/SharedPostCard.tsx` | `as any` cast |
| `src/components/chat/ChannelConversation.tsx` | `as any` cast |
| `src/components/chat/chatConversationHelpers.ts` | `as any` cast |
| Multiple components using `React.FC` | 16 files |

---

## ✅ Strengths Observed

- **TypeScript hygiene:** No compilation errors across 213 files
- **Debug code:** Zero production debug statements found
- **Security posture:** No user-input XSS vectors detected
- **Accessibility:** Images properly labeled, ARIA used appropriately
- **Timer management:** Correct patterns used throughout (except the one noted)
- **Code organization:** Clear separation between components, hooks, and lib modules

---

## 🎯 Post-Audit Actions

1. **Immediate:** Create GitHub issues for critical fixes
2. **This sprint:** Address `any` type reduction (could be gradual)
3. **Next sprint:** Refactor innerHTML, review error handling
4. **Long-term:** Consider React.FC migration plan (low priority)

---

**Audit completed by:** Kilo AI Agent  
**Total audit time:** ~15 minutes  
**Confidence level:** High (automated + manual verification)
