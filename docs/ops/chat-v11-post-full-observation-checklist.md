# Chat v1.1 Post-Full Observation Checklist

## Window
- Start (UTC):
- End (UTC):
- Owner:

## Must stay green
1. ack_without_receipt_10s_rate = 0
2. timeline_duplicate_detected_rate = 0
3. read_rollback_detected_rate = 0

## Stability checks
1. write_receipt_p95_ms <= target
2. forced_resync_rate <= threshold
3. full_state_rate near baseline
4. ERR_RESYNC_RANGE_UNAVAILABLE no spike
5. ERR_RESYNC_THROTTLED no storm

## SQL checks (each shift)
```sql
select * from public.chat_get_v11_release_gates();
select * from public.chat_get_v11_rollout_state();
select * from public.chat_get_v11_rollout_history(20);
```

## Escalation
- Any hard invariant breach -> follow `docs/runbooks/chat-incident-playbook-v1.1.md` P0 flow.

## Exit criteria
1. Observation window completed with no P0/P1 incident.
2. Gate status remains PROCEED.
3. Release closure record updated.
