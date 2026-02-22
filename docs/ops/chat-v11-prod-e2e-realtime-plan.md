# Chat v1.1 Prod E2E Plan (Supabase Realtime)

## Goal
Подтвердить сквозной production-like путь: `send -> ACK -> write.receipt -> realtime delivery -> reconnect -> gap/resync -> convergence`.

## Scope
- Включено:
  - send_message idempotency
  - receipt race handling
  - reconnect and gap recovery
  - read cursor monotonic convergence
- Не включено:
  - media heavy pipeline
  - moderation/admin flows

## Environment
- Supabase project: production (or prod-mirror)
- 3 test users, 3 devices/sessions
- Canary stage active (`canary_1`/`canary_10`)

## Test Cases
1. Baseline send/receipt
- Send from device A.
- Expected: ACK accepted, receipt delivered <= SLO, message appears in timeline and inbox.

2. Receipt race
- Inject delay in realtime channel while ACK is immediate.
- Expected: client does not duplicate sends; either receipt arrives or fallback status_write/resync closes cycle.

3. Reconnect during pending
- Disconnect right after ACK, reconnect within 5-15s.
- Expected: no duplicate message; pending state resolves via receipt/status_write.

4. Gap and incremental resync
- Force gap in dialog stream.
- Expected: resync_stream(since) closes gap without full_state.

5. Range unavailable fallback
- Simulate since below retention_min_seq.
- Expected: ERR_RESYNC_RANGE_UNAVAILABLE then single full_state_dialog (throttled) and convergence.

6. Multi-device read monotonicity
- Device A marks read high seq, device B later sends lower read seq.
- Expected: server keeps max cursor, no rollback.

## Acceptance
- 0 timeline duplicates.
- 0 read rollback.
- ack_without_receipt_10s_rate = 0.
- forced_resync_rate within gate threshold.
- All cases reproducible and logged with trace IDs.

## Artifacts to attach
- Gate run URL
- SQL snapshot from release gates/state/history
- Client logs with trace_id and client_write_seq
- Incident notes if any anomaly
