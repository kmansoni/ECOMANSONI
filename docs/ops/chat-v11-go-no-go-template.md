# Chat v1.1 Go/No-Go Template

## 1. Context
- Date (UTC):
- Environment:
- Target stage: `canary_1 | canary_10 | canary_50 | full`
- Decision owner:

## 2. SQL snapshots
```sql
select * from public.chat_get_v11_release_gates();
select * from public.chat_get_v11_rollout_state();
select * from public.chat_get_v11_rollout_history(20);
```

- gate_p0_ok:
- gate_p1_ok:
- gate_rollout_ok:
- rollout_decision:

## 3. Metrics (must fill)
- ack_without_receipt_10s_rate:
- timeline_duplicate_detected_rate:
- read_rollback_detected_rate:
- write_receipt_p95_ms:
- forced_resync_rate:

## 4. Runbook acknowledgment
- Incident runbook reviewed: `docs/runbooks/chat-incident-playbook-v1.1.md`
- Canary runbook reviewed: `docs/runbooks/chat-canary-rollout-v1.1.md`
- Ops checklist reviewed: `docs/runbooks/chat-ops-checklist-v1.1.md`

## 5. Decision
- Final: `GO | NO-GO`
- If NO-GO, action: `HOLD | ROLLBACK | KILL_SWITCH`
- Notes:
