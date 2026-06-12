# Chat Ops Checklist v1.1

## 1. Shift Start (first 10 minutes)
1. Подтверди роли на смену: `IC`, `Backend`, `SRE`, `Frontend`.
2. Проверь текущий rollout state:
```sql
select * from public.chat_get_v11_rollout_state();
```
3. Проверь текущие release gates:
```sql
select * from public.chat_get_v11_release_gates();
```
4. Проверь последние изменения rollout:
```sql
select * from public.chat_get_v11_rollout_history(20);
```

## 2. Hard Invariants (must stay green)
1. `ack_without_receipt_10s_rate = 0`
2. `timeline_duplicate_detected_rate = 0`
3. `read_rollback_detected_rate = 0`

If any invariant is red:
- Follow `docs/runbooks/chat-incident-playbook-v1.1.md` (P0 flow).

## 3. Recovery Health Watch
1. `forced_resync_rate` stable (no spikes)
2. `full_state_rate` near baseline
3. `ERR_RESYNC_RANGE_UNAVAILABLE` no spike
4. `ERR_RESYNC_THROTTLED` no storm pattern

If recovery degrades:
- Follow P1 section in `docs/runbooks/chat-incident-playbook-v1.1.md`.

## 4. Rollout Decision Rules
- Promote stage only if all are true:
1. `gate_p0_ok=true`
2. `gate_p1_ok=true`
3. `gate_rollout_ok=true`
4. `rollout_decision='PROCEED'`

Stage runbook:
- `docs/runbooks/chat-canary-rollout-v1.1.md`

## 5. Stop/Freeze Commands
### Soft hold
```sql
select * from public.chat_set_v11_rollout_state('canary_1', false, 'hold for investigation');
```

### Hard kill switch (P0)
```sql
select * from public.chat_set_v11_rollout_state('canary_1', true, 'P0 hard stop');
```

## 6. Shift Handover
1. Current stage and `kill_switch` status
2. Last 3 gate snapshots (UTC)
3. Any active alerts and owner
4. Open risks/blockers
5. Next planned action (`PROCEED`/`HOLD`/`ROLLBACK`)

## 7. Daily Close Criteria
1. No active P0/P1
2. Invariants stayed green for observation window
3. Decision log updated
4. Any incident has owner + ETA for permanent fix

## 8. Reference Docs
- `docs/runbooks/chat-incident-playbook-v1.1.md`
- `docs/runbooks/chat-canary-rollout-v1.1.md`
