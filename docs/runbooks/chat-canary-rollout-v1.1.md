# Chat Canary Rollout Runbook v1.1

## 1. Purpose
- Безопасно раскатить chat v1.1 по стадиям: `canary_1 -> canary_10 -> canary_50 -> full`.
- Не допустить регрессий по P0-инвариантам (`ACK -> receipt`, duplicate=0, read rollback=0).

## 2. Preconditions (must pass)
1. Миграции v1.1 применены и синхронизированы (`migration list` без pending для chat v1.1).
2. Smoke RPC проходит:
- `chat_get_v11_release_gates()`
- `chat_get_v11_rollout_state()`
- `chat_get_v11_rollout_history(20)`
3. On-call готов: назначены `IC`, `Backend`, `SRE`, `Frontend`.
4. Runbook P0/P1 доступен: `docs/runbooks/chat-incident-playbook-v1.1.md`.
5. CI gate workflow обязателен перед каждым promote:
- `.github/workflows/chat-v11-release-gate.yml`
- шаблон фиксации решения: `docs/ops/chat-v11-go-no-go-template.md`

## 3. Stage Durations
- `canary_1`: 30-60 минут.
- `canary_10`: 2-4 часа.
- `canary_50`: 12-24 часа.
- `full`: только после успешного окна `canary_50`.

## 4. Hard Stop Conditions (instant rollback/kill)
1. `ack_without_receipt_10s_rate > 0`.
2. `timeline_duplicate_detected_rate > 0`.
3. `read_rollback_detected_rate > 0`.
4. Массовый user-facing send stall.

Action on hard stop:
```sql
select * from public.chat_set_v11_rollout_state('canary_1', true, 'hard stop: p0 invariant breach');
```

## 5. Stage Gate Query (run before each promote)
```sql
select * from public.chat_get_v11_release_gates();
select * from public.chat_get_v11_rollout_state();
select * from public.chat_get_v11_rollout_history(50);
```

Promote only when:
- `gate_p0_ok=true`
- `gate_p1_ok=true`
- `gate_rollout_ok=true`
- `rollout_decision='PROCEED'`

## 6. Stage Actions

### 6.1 Enter `canary_1`
```sql
select * from public.chat_set_v11_rollout_state('canary_1', false, 'start canary 1%');
```
Checks during window:
- receipt latency trend stable
- forced resync not spiking
- no hard stop triggers

### 6.2 Promote to `canary_10`
```sql
select * from public.chat_set_v11_rollout_state('canary_10', false, 'promote to 10%');
```
Checks during window:
- stable p95 write receipt
- no recovery storm
- no P0 invariant breach

### 6.3 Promote to `canary_50`
```sql
select * from public.chat_set_v11_rollout_state('canary_50', false, 'promote to 50%');
```
Checks during window:
- long-run stability (12-24h)
- no hidden drift under sustained load

### 6.4 Promote to `full`
```sql
select * from public.chat_set_v11_rollout_state('full', false, 'promote to full');
```
Post-full: усиленный мониторинг минимум 24 часа.

## 7. Rollback Modes

### 7.1 Soft hold (no kill)
```sql
select * from public.chat_set_v11_rollout_state('canary_1', false, 'hold rollout for investigation');
```

### 7.2 Hard kill
```sql
select * from public.chat_set_v11_rollout_state('canary_1', true, 'kill switch enabled');
```

## 8. Monitoring Checklist per Stage
1. `ack_without_receipt_10s_rate`
2. `write_receipt_p95_ms`
3. `forced_resync_rate`
4. `full_state_rate`
5. `ERR_RESYNC_RANGE_UNAVAILABLE` rate
6. `ERR_RESYNC_THROTTLED` rate

## 9. Decision Log (required)
For every stage transition record:
1. UTC time
2. Current stage -> target stage
3. Gate values snapshot
4. Decision (`PROCEED`/`HOLD`/`ROLLBACK`)
5. Owner approving transition

## 10. Completion Criteria
- `full` enabled with no P0/P1 incidents in observation window.
- Post-rollout review completed.
- Action items (if any) assigned with owners/dates.
