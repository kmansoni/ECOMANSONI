# Chat v1.1 DB and Transaction Spec (MVP)

## Scope
This document defines the backend/database foundation for MVP v1.1:
- durable write path (`send_message`, `mark_read`);
- idempotency ledger;
- append-only stream events;
- inbox projection;
- receipt closure;
- recovery (`status_write`, `resync_stream`).

## Storage Model

### Core tables
- `public.chat_write_ledger`
  - idempotency key: unique `(actor_id, device_id, client_write_seq)`;
  - canonical result fields (`canonical_msg_id`, `canonical_msg_seq`, `canonical_last_read_seq`);
  - terminal status/error fields.
- `public.chat_events`
  - append-only events per stream;
  - uniqueness: `(stream_id, event_seq)` and `event_id`;
  - ordering truth: `event_seq` is strictly monotonic inside a stream.
- `public.chat_stream_heads`
  - current head sequence (`last_event_seq`) per stream;
  - used by `chat_next_stream_seq`.
- `public.chat_inbox_projection`
  - materialized inbox state per `(user_id, dialog_id)`;
  - canonical `sort_key` is server-generated.
- `public.chat_receipts`
  - closes write lifecycle after `ACK accepted|duplicate`;
  - uniqueness: `(user_id, device_id, client_write_seq)`.

### Supporting metrics tables and views
- `public.chat_client_metrics`
- `public.chat_v11_metrics_last_15m`
- `public.chat_v11_health_last_15m`

## Index Contract
- `chat_write_ledger`: `expires_at`, `(actor_id, device_id, created_at DESC)`.
- `chat_events`: `(stream_id, created_at DESC)`, partial `(dialog_id, event_seq)`.
- `chat_inbox_projection`: `(user_id, sort_key DESC)`, `(user_id, updated_at DESC)`.
- `chat_receipts`: `(user_id, created_at DESC)`.
- `chat_client_metrics`: `(metric_name, created_at DESC)`, `(actor_id, created_at DESC)`.

## Transaction Contract

### `chat_send_message_v11` durable order
Single transaction, strict sequence:
1. Validate auth and membership.
2. Check idempotency ledger:
   - if existing key, return `duplicate` with canonical payload.
3. Insert `chat_write_ledger` row with `pending`.
4. Insert domain message (`messages`) and advance `conversations.last_message_seq`.
5. Append stream events:
   - `dialog:{dialog_id}` -> `message.created`;
   - `user:{participant}:inbox` -> `inbox.item_updated`.
6. Update `chat_inbox_projection` for all participants.
7. Insert author receipt in `chat_receipts` (`delivered`).
8. Update ledger row -> `accepted` + canonical fields.
9. Return ACK (`accepted`).

Invariant: `ACK accepted|duplicate` is returned only after durable transaction commit.

### `chat_mark_read_v11` durable order
1. Validate auth and membership.
2. Check idempotency ledger for duplicate.
3. Insert `pending` ledger row.
4. Compute `last_read_seq_applied = max(current, min(requested, dialog_head))`.
5. Update `chat_inbox_projection` (`last_read_seq`, `unread_count`).
6. Append events:
   - `user:{user_id}:reads` -> `read.cursor_updated`;
   - `user:{user_id}:inbox` -> `inbox.item_updated`.
7. Insert receipt row.
8. Update ledger row -> `accepted` + `canonical_last_read_seq`.
9. Return ACK (`accepted`).

## Delivery and Recovery Contract
- `chat_status_write_v11`
  - returns write status from ledger by `(device_id, client_write_seq)`.
- `chat_resync_stream_v11`
  - returns event range by `stream_id` and `since_event_seq`;
  - stream auth:
    - dialog stream: participant-only;
    - user stream: owner-only.

## Error Semantics (MVP baseline)
- `ERR_UNAUTHORIZED`: no `auth.uid()`.
- `ERR_FORBIDDEN`: no rights for dialog/stream.
- `ERR_INVALID_ARGUMENT`: invalid request payload.
- `ERR_RESYNC_RANGE_UNAVAILABLE`: recovery range not available (next phase hardening).

## Security and RLS Notes
- RLS is enabled on core tables.
- Client access is contractually allowed only through `SECURITY DEFINER` RPC.
- Direct client read/write on core tables is out of contract.

## Realtime Notes
- `chat_events`, `chat_receipts`, and `chat_inbox_projection` are added to `supabase_realtime`.
- Client apply ordering uses `event_seq` only within a single `stream_id`.
- No cross-stream ordering guarantee.

## Open items for next phase
1. Add explicit retention boundary in `resync_stream` with `ERR_RESYNC_RANGE_UNAVAILABLE`.
2. Add snapshot/full-state RPC for hard recovery.
3. Split ACK schemas at API layer: message-write ACK and cursor-write ACK.
4. Extend write path with `edit_message` and `toggle_reaction`.
