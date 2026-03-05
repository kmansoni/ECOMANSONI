# Chat Functional Gap Audit (No Security Scope)

Date: 2026-03-05
Scope: chat functionality, product behavior, reliability, stubs/placeholders, flow conflicts.
Out of scope: security model, encryption/E2EE, auth hardening.

---

## 1) Executive Summary

Current chat system is feature-rich but architecturally uneven. The biggest non-security risk is **behavioral inconsistency across parallel flows** (DM v11 + legacy media path + legacy pages + mixed fallback models). The product can look healthy in happy-path tests and still fail in edge cases (reconnect, duplicated realtime events, cross-device drift, inconsistent settings semantics).

Top non-security blockers:
1. Split DM send path (text vs media use different protocols).
2. Settings key mismatch (UI toggles may not affect runtime behavior).
3. Realtime duplicate risk in channels/groups.
4. Dead-but-existing legacy chat pages with invalid route expectations.
5. Thread feature is mostly disconnected from active UX and partially stubbed.

---

## 2) System Reality Snapshot

### 2.1 Active UI route
- Active chat route: `/chats` in `src/App.tsx`.

### 2.2 Legacy branch still present
- Legacy pages still in codebase:
  - `src/pages/ChatPage.tsx`
  - `src/pages/ChatRoom.tsx`
- Legacy page still navigates to `/chat/{id}`, but route is not wired in active router.

### 2.3 DM protocol split
- Text uses `chat_send_message_v11` when enabled.
- Media still uses `sendMessageV1` path.

This creates mixed semantics for retries, receipts, dedupe, and error handling within the same conversation.

---

## 3) Critical Functional Gaps (P0)

## P0-1: DM write-path inconsistency (text vs media)
- Evidence:
  - `src/hooks/useChat.tsx` text path calls `chat_send_message_v11`.
  - `src/hooks/useChat.tsx` media path calls `sendMessageV1`.
- Symptom:
  - One chat has two backend contracts depending on payload type.
- Impact:
  - Different ACK/receipt/recovery behavior for text vs media.
  - Hard-to-reproduce “sent text works, media feels flaky/late” user reports.
- Priority: P0
- Fix direction:
  - Unify media send onto v11 write contract (or clearly isolate and surface mode).

## P0-2: Chat settings semantic mismatch
- Evidence:
  - Runtime reads `media_auto_download_enabled/photos/videos` in `src/components/chat/ChatConversation.tsx`.
  - Settings hook exposes `auto_download_media` in `src/hooks/useChatSettings.ts`.
- Symptom:
  - User toggles may not control actual preloading/autoplay gates.
- Impact:
  - “Settings don’t work” perception, UX trust erosion.
- Priority: P0
- Fix direction:
  - Define canonical settings schema + adapter/migration layer.

## P0-3: Realtime duplicate insertion risk in channels/groups
- Evidence:
  - Insert handler appends directly:
    - `src/hooks/useChannels.tsx`
    - `src/hooks/useGroupChats.tsx`
- Symptom:
  - Duplicate messages after reconnect/replay/re-subscribe races.
- Impact:
  - Timeline noise, incorrect unread, broken confidence in message history.
- Priority: P0
- Fix direction:
  - Id-based dedupe on insert path + periodic reconciliation.

## P0-4: Dead legacy routes can re-break quickly
- Evidence:
  - `src/pages/ChatPage.tsx` uses `/chat/{id}` navigate path.
  - `src/App.tsx` exposes `/chats` only.
- Symptom:
  - Any accidental reuse of legacy page fails at navigation.
- Impact:
  - Regression hazard during refactors or feature toggles.
- Priority: P0
- Fix direction:
  - Remove/retire legacy pages or hard-guard behind dev-only gate.

---

## 4) High-Impact Functional Gaps (P1)

## P1-1: Thread feature is effectively detached
- Evidence:
  - `useThreadMessages` / `useThreadBadge` only defined in `src/hooks/useChatThreads.ts`; no active UI usages found.
  - `unreadCount: 0` TODO in thread badge logic.
- Symptom:
  - Thread behavior appears incomplete/inert.
- Impact:
  - Product inconsistency (“feature exists in code but not in experience”).
- Priority: P1
- Fix direction:
  - Either integrate end-to-end or remove from active scope.

## P1-2: Live location is partial visualization
- Evidence:
  - `src/components/chat/LiveLocationMessage.tsx` contains TODO for server-side position update.
- Symptom:
  - Sender moves; recipients may not get true live updates.
- Impact:
  - Feature appears present but degrades to pseudo-live.
- Priority: P1
- Fix direction:
  - Add server update channel + throttled writer + subscriber update path.

## P1-3: Invite flow duplication in ChatsPage
- Evidence:
  - Legacy-style query flow (`channel_invite`, `group_invite`) and newer consolidated `invite` flow coexist.
- Symptom:
  - Multiple join attempts/duplicate toasts under certain query combos.
- Impact:
  - Confusing onboarding into group/channel.
- Priority: P1
- Fix direction:
  - Normalize invite parsing into one deterministic finite flow.

## P1-4: Heavy fallback behavior without deterministic reconciliation
- Evidence:
  - Archive/pin/reactions include localStorage fallback modes.
- Symptom:
  - Device-to-device divergence windows.
- Impact:
  - “Why is chat pinned here but not there?”
- Priority: P1
- Fix direction:
  - Add explicit source-of-truth precedence + sync reconciliation markers.

## P1-5: Channel/group realtime does not update all message transitions
- Evidence:
  - Hooks focus on INSERT events and list updates; edit/delete handling is uneven.
- Symptom:
  - UI can lag/omit transitions until full refetch.
- Impact:
  - Temporary inconsistency in conversation state.
- Priority: P1
- Fix direction:
  - Add UPDATE/DELETE handlers + id-based reducer.

---

## 5) Medium Functional Debt (P2)

## P2-1: Uneven error semantics across DM/Group/Channel
- Symptom:
  - Similar failures surface different messages/retry patterns.
- Impact:
  - Unpredictable UX under load or temporary backend drift.
- Fix direction:
  - Shared error taxonomy + shared toast mapping.

## P2-2: High complexity in `ChatsPage` orchestration
- Symptom:
  - Many concerns (foldering, archive/pin, deep links, calls tab, invites) in one component.
- Impact:
  - Higher regression probability for seemingly small changes.
- Fix direction:
  - Isolate state machines: query-actions, list-filtering, selection, and action side effects.

## P2-3: Read-state and projection drift risk under partial failures
- Evidence:
  - Read mark path is robust, but channel/group parity and projections are not uniformly handled.
- Impact:
  - Occasional unread badge mismatch.
- Fix direction:
  - Periodic projection reconciliation hooks per list page.

## P2-4: N+1-style profile enrichment on live insert handlers
- Evidence:
  - Per-message sender profile fetch in realtime insert handlers.
- Impact:
  - Latency spikes in active rooms, visual pop-in.
- Fix direction:
  - In-memory sender cache + batched hydration.

---

## 6) Stub/Placeholder Inventory

1. Live location server sync TODO (`LiveLocationMessage`).
2. Thread unread calculation TODO (`useChatThreads`).
3. Legacy chat pages retained without active routing.
4. Multiple fallback branches (reactions, archive, pin) with weak explicit reconciliation semantics.

---

## 7) Conflict Matrix

### 7.1 Product contract conflicts
- One message domain, multiple write contracts (v11 + v1).
- One settings UI, divergent runtime keys.

### 7.2 UX conflicts
- Features that appear complete but are partially simulated (live location, threads).
- Different surfaces react differently to similar backend delays.

### 7.3 Data-flow conflicts
- optimistic append + realtime replay without uniform dedupe strategy across all chat types.

---

## 8) Test Coverage Gaps (Functional)

Strong existing coverage:
- DM v11 recovery/readiness/rpc policy.
- Deep-link query parsing basics.

Missing high-value tests:
1. Channel/group realtime duplicate replay.
2. Chat settings key compatibility (UI toggle -> runtime behavior).
3. Invite flow precedence under mixed query params.
4. Thread lifecycle and unread behavior.
5. Live-location update propagation.

---

## 9) Immediate Functional Refactor Plan (No Security Scope)

### Phase A (1-2 days, P0)
1. Unify settings key contract (`auto_download_*` mapping layer).
2. Add id-based dedupe reducers for channel/group realtime insert.
3. Hard-retire or isolate legacy `ChatPage`/`ChatRoom` from production flow.

### Phase B (2-4 days, P1)
1. Merge invite pipelines into one deterministic parser/executor.
2. Add UPDATE/DELETE realtime handling parity for channel/group.
3. Thread decision: full integration or explicit de-scope.

### Phase C (3-5 days, P1/P2)
1. Live location true server update path.
2. Sender profile cache for realtime handlers.
3. Functional regression suite for channel/group parity.

---

## 10) Definition of Done (Functional Only)

1. DM, group, channel share consistent message lifecycle semantics.
2. Settings toggles deterministically affect media behavior.
3. Realtime duplicates eliminated under reconnect/replay scenarios.
4. No dead legacy route path can be triggered in production.
5. Stubbed features either completed or intentionally hidden/de-scoped.
6. New tests cover all critical functional race paths above.
