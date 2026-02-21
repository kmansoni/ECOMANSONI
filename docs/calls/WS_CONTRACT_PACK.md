# WS Contract Pack (Calls) — Mansoni

Source of truth for the Calls WebSocket protocol.

- Human-readable spec: this document
- Machine-readable artifacts: `docs/calls/schemas/*.schema.json` + `docs/calls/machines/*.yaml`

## 1) Envelope, guarantees, rules

### 1.1 Envelope (required)

All WS frames MUST be wrapped in the envelope.

- `v`: protocol version (1)
- `type`: message type
- `msgId`: UUID idempotency key (required always)
- `ts`: unix ms timestamp
- `seq`: per-connection monotonic sequence number (required for ORDERED classes)
- `ack`: ACK frame (when present, the frame is treated as an ACK)
  - `ack.ackOfMsgId`: original `msgId` being acknowledged
- `payload`: type-specific payload

**Rule:** `seq` is required for all messages in class `ORDERED` or `ORDERED+ACKED`.

### 1.2 Message classes

- **ORDERED+ACKED**: strict order + mandatory ACK (with retry)
  - Examples: `ROOM_JOIN`, `TRANSPORT_CONNECT`, `PRODUCE`, `CONSUME`, `ICE_RESTART`, `KEY_PACKAGE`, `KEY_ACK`
- **ORDERED (no ack)**: strict order, ACK not required
  - Examples: server notifications like `PEER_JOINED`, `PRODUCER_ADDED`
- **UNORDERED (best effort)**: no ordering guarantee
  - Examples: telemetry/metrics (if/when added)

### 1.3 Idempotency (server)

Server MUST:
- keep `seen:{connId}:{msgId}` in Redis for TTL 2–5 minutes
- on duplicate `msgId`:
  - do not apply side-effects again
  - return the same result when possible, or ACK ok=true without side-effects

### 1.4 `seq` handling

If incoming `seq == expected`: apply.

If `seq < expected`: treat as duplicate → ACK ok=true (no side-effects).

If `seq > expected`: **strict mode** (recommended):
- return `SEQ_OUT_OF_ORDER`
- require a RESYNC (reconnect+snapshot)

### 1.5 Snapshot / resume

On reconnect/resume, server MUST provide a snapshot to restore state.

**Required:** after reconnect/resume, server MUST provide a snapshot.

**Recommended:** a single `ROOM_SNAPSHOT` message containing:
- peers
- current `epoch` and `memberSetVersion`
- active producers list
- e2ee expectations (which senders/keys are required)

## 2) Type matrix (who sends what)

| Type | From→To | Class | `seq` | `ack` | Side-effect |
|---|---|---:|:---:|:---:|---|
| HELLO | C→S | ORDERED+ACKED | ✅ | ✅ | open session |
| WELCOME | S→C | ORDERED | ✅ | ❌ | resumeToken/heartbeat |
| AUTH | C→S | ORDERED+ACKED | ✅ | ✅ | validate token |
| AUTH_OK/FAIL | S→C | ORDERED | ✅ | ❌ | auth state |
| E2EE_CAPS | C→S | ORDERED+ACKED | ✅ | ✅ | capabilities |
| E2EE_POLICY | S→C | ORDERED | ✅ | ❌ | allow/deny |
| ROOM_CREATE | C→S | ORDERED+ACKED | ✅ | ✅ | room binding |
| ROOM_CREATED | S→C | ORDERED | ✅ | ❌ | roomId/callId |
| ROOM_JOIN | C→S | ORDERED+ACKED | ✅ | ✅ | join + tokens + transport opts |
| ROOM_JOIN_OK | S→C | ORDERED | ✅ | ❌ | joinToken + params |
| ROOM_SNAPSHOT | S→C | ORDERED | ✅ | ❌ | state snapshot |
| ROOM_PEERS | S→C | ORDERED | ✅ | ❌ | peers list |
| PEER_JOINED/LEFT | S→C | ORDERED | ✅ | ❌ | membership change |
| TRANSPORT_CREATE | C→S | ORDERED+ACKED | ✅ | ✅ | create transport |
| TRANSPORT_CONNECT | C→S | ORDERED+ACKED | ✅ | ✅ | dtls connect |
| PRODUCE | C→S | ORDERED+ACKED | ✅ | ✅ | create producer |
| PRODUCER_ADDED | S→C | ORDERED | ✅ | ❌ | notify consume |
| CONSUME | C→S | ORDERED+ACKED | ✅ | ✅ | create consumer |
| CONSUMER_ADDED | S→C | ORDERED | ✅ | ❌ | attach remote |
| ICE_RESTART | C→S | ORDERED+ACKED | ✅ | ✅ | ICE restart |
| ROOM_MIGRATE | S→C | ORDERED | ✅ | ❌ | node migration |
| REKEY_BEGIN | S→All | ORDERED | ✅ | ❌ | new epoch |
| KEY_PACKAGE | C→S→C | ORDERED+ACKED | ✅ | ✅ | key delivery |
| KEY_ACK | C→S→C | ORDERED+ACKED | ✅ | ✅ | quorum |
| REKEY_COMMIT/ABORT | S→All | ORDERED | ✅ | ❌ | commit/abort |

## 3) Normative timers

- `T_ICE_CONNECT = 4000ms` (policy=all)
- `T_FORCE_RELAY = 4000–5000ms`
- `T_ICE_RELAY_CONNECT = 6000–8000ms`
- `T_REKEY_QUORUM = 8000ms`
- WS heartbeat `ping=10s`, miss threshold `25s`
- Join token TTL `120s` + anti-replay via `jti`

## 4) Contract Test Matrix (QA/Dev)

Format: Scenario → Steps → Expected WS events → Client invariants → Server invariants → Metrics

### S0. Smoke (1:1, E2EE required, STUN ok)

- Steps
  - A: `HELLO` → `AUTH` → `E2EE_CAPS`
  - A: `ROOM_CREATE` → `ROOM_CREATED` → `ROOM_JOIN` → `ROOM_JOIN_OK`
  - B joins similarly
  - `PRODUCER_ADDED` → `CONSUME` → `CONSUMER_ADDED`
  - If rekey-on-join policy: `REKEY_BEGIN` → `KEY_PACKAGE/KEY_ACK` → `REKEY_COMMIT`
- Client invariants
  - No partial decrypt: until E2EE ready, remote media may render black/paused, but must not decrypt partially
  - `seq` monotonic, any gap triggers resync
- Server invariants
  - join token one-time (anti-replay), TTL 120s
  - membership change triggers rekey when policy enabled
- Metrics
  - `setup_time_ms` P50/P95
  - `join_success_rate`
  - `e2ee_ready_time_ms`
  - `relay_usage_rate = 0`

### S1. Relay fallback (CGNAT), fast to TURN

- Steps
  - Join with policy=all
  - If not connected within `forceRelayAfterMs`: client sends `ICE_RESTART(policy=relay)`
- Client invariants
  - Do not wait 30–60s; enforce relay quickly
  - Stick to relay until call ends
- Server invariants
  - TURN creds are short TTL and non-static (REST auth) for production
- Metrics
  - `relay_fallback_rate`
  - `relay_connect_time_ms`
  - `% failed_ice_all_then_success_relay`

### S2. Group late join → mandatory rekey quorum

- Expected
  - `PEER_JOINED` → `REKEY_BEGIN` → many `KEY_PACKAGE/KEY_ACK` → `REKEY_COMMIT`
- Client invariants
  - Late join not `e2eeReady` until all required sender keys received
- Server invariants
  - quorum tracked per `deviceId`
- Metrics
  - `rekey_time_ms`, `rekey_abort_rate`, `key_delivery_retry_count`

### S3. Kick/ban → rekey, excluded cannot decrypt

- Expected
  - Others: `PEER_LEFT(KICKED)` + rekey flow
- Invariants
  - After commit: old keys forbidden
  - Excluded device cannot decrypt new epoch

### S4. Node migrate → rejoin → call continues

- Expected
  - `ROOM_MIGRATE` → `ROOM_JOIN_OK` (new node) → `ROOM_SNAPSHOT`
- Invariants
  - epoch does not change due to migrate

### S5. WS reconnect/resume + snapshot

- Expected
  - `WELCOME` + `ROOM_SNAPSHOT` after resume
  - optional mailbox key redelivery

### S6. Seq out-of-order / duplicate msg

- Expected
  - duplicate `msgId` → ACK ok=true, no side-effects
  - seq gap → `SEQ_OUT_OF_ORDER` + resync via `ROOM_SNAPSHOT`

## 5) ROOM_SNAPSHOT (authoritative)

- Purpose: atomic truth for join/migrate/reconnect/resync to reduce races.
- Server MUST send `ROOM_SNAPSHOT`:
  - after `ROOM_JOIN_OK` (within 0–200ms)
  - after migrate rejoin
  - after resume/reconnect
  - after resync triggers (`SEQ_OUT_OF_ORDER`)
- Client MUST treat snapshot as authoritative (replace local state).
- Client MUST apply snapshot only if `roomVersion` increased; otherwise ignore (prevents stale snapshot races).
- If `snapshot.e2ee.missingSenderKeys` is present and non-empty: client enters E2EE rekey/resync mode and waits for `KEY_PACKAGE` deliveries.

## 6) KEY_PACKAGE mailbox (delivery guarantee)

Mailbox exists because key delivery is critical.

### 6.1 Record model (logical)

- `id` (uuid)
- `roomId`, `epoch`
- `fromDeviceId`, `toDeviceId`
- `senderKeyId`
- `ciphertext`, `sig`
- `createdAt`, `expiresAt`
- `deliveredAt?`, `ackedAt?`, `attempts`

### 6.2 Storage

- Primary: Redis (fast) with TTL
- Optional durability: Postgres for audit/debug (ciphertext only)

### 6.3 TTL

- KEY_PACKAGE TTL = max(2×rekey quorum, 60s). Recommended 120s.

### 6.4 Delivery semantics

- Server validates KEY_PACKAGE:
  - epoch is expected
  - sender and receiver are current participants
  - signature valid (Ed25519) over metadata + ciphertext
- Server writes to mailbox key `mailbox:{roomId}:{toDeviceId}`
- If receiver online: push delivery immediately
- On reconnect/resume: server uses `ROOM_SNAPSHOT.e2ee.missingSenderKeys` to re-push missing KEY_PACKAGE (no separate pull required).

### 6.5 Retries

- If ACK not received, server may re-send with exponential backoff capped at 3000ms until deadline.
- On deadline: `REKEY_ABORT` or policy degrade/exclude.

### 6.6 Idempotency

- KEY_PACKAGE idempotency key: (roomId, epoch, fromDeviceId, toDeviceId, senderKeyId)
- KEY_ACK idempotency key: (roomId, epoch, fromDeviceId, toDeviceId, senderKeyId)

### 6.7 Security limits

- Server never stores plaintext keys.
- Rate limit key packages per sender device.
- Cap mailbox size per receiver device.
- On kick: delete mailbox for kicked device and deny future sync.

## 7) Golden traces (5)

Traces are normative examples. `msgId` values are omitted for brevity.

### Trace 1 — Success (STUN, E2EE ok, 1:1)

1) C→S `HELLO`
2) S→C `WELCOME`
3) C→S `AUTH`
4) S→C `AUTH_OK`
5) C→S `E2EE_CAPS`
6) C→S `ROOM_CREATE` (preferredRegion=tr, e2eeRequired=true)
7) S→C `ROOM_CREATED` (roomId=R, nodeId=tr-sfu-2, epoch=0)
8) C→S `ROOM_JOIN` (roomId=R)
9) S→C `ROOM_JOIN_OK` (turn.iceServers…, forceRelayAfterMs=4000)
10) C→S `TRANSPORT_CONNECT` send/recv
11) C→S `PRODUCE` audio/video
12) S→C `PRODUCER_ADDED` → C→S `CONSUME`
13) S→C `CONSUMER_ADDED`
14) (policy) S→All `REKEY_BEGIN` (newEpoch=1)
15) Key exchange via `KEY_PACKAGE`/`KEY_ACK`
16) S→All `REKEY_COMMIT` (epoch=1)

### Trace 2 — Relay fallback (mobile CGNAT)

Same as Trace 1 through `ROOM_JOIN_OK`, then:

- Client starts ICE policy=all, waits `T_ICE_CONNECT`
- On timeout: C→S `ICE_RESTART` (policy=relay, reason=CONN_TIMEOUT)
- ICE connects via TURN, call continues

### Trace 3 — Group late join triggers rekey

- Existing call at epoch=5
- New device joins → S→All `PEER_JOINED` + `REKEY_BEGIN` (newEpoch=6)
- All senders deliver `KEY_PACKAGE(epoch=6)` to the new device
- New device responds with `KEY_ACK` for each
- S→All `REKEY_COMMIT(epoch=6)`

### Trace 4 — Node migrate

- In call epoch=3
- S→All `ROOM_MIGRATE(fromNodeId, toNodeId, rejoinAfterMs=1500)`
- Client re-joins via `ROOM_JOIN` (with e2eeState), receives `ROOM_JOIN_OK`
- Rebuild transports, resume produce/consume

### Trace 5 — WS reconnect + snapshot

- In call
- WS drops
- Client reconnects with `HELLO.resume`
- Server sends `WELCOME` + `ROOM_SNAPSHOT`
- Client restores consumers/producers and re-syncs E2EE keys if needed

## 5) Notes

- TURN `iceServers` must allow STUN entries without auth.
- Mobile E2EE is frame-level (SFrame-style). Web E2EE uses Insertable Streams.
