# Chat v1.1 Health Ops Contract

## RPC
- `chat_get_v11_health()`
  - baseline 15m health counters/latency.
- `chat_get_v11_health_extended()`
  - baseline health + recovery policy snapshot observability.
- `chat_get_v11_release_gates(...)`
  - formal rollout decision based on P0/P1 gate thresholds.
- `chat_get_v11_rollout_state()`
  - current rollout stage + kill switch + gate recommendation.
- `chat_set_v11_rollout_state(...)` *(service_role only)*
  - updates rollout stage and kill switch.
- `chat_get_v11_rollout_history(limit)`
  - rollout journal history (audit trail).

## Extended fields (`chat_get_v11_health_extended`)
- `recovery_policy_samples_15m`
  - number of `recovery_policy_snapshot` client metrics in last 15 minutes.
- `recovery_policy_last_labels`
  - latest policy labels from client metrics:
    - `min_delay_ms`
    - `max_delay_ms`
    - `exponential_base_ms`
    - `jitter_ratio`
- `recovery_policy_last_seen_at`
  - timestamp of last observed policy snapshot.

## Operational checks
1. `recovery_policy_samples_15m > 0` for active canary users.
2. `recovery_policy_last_seen_at` fresh (within expected client activity window).
3. Compare `recovery_policy_last_labels` against release config to detect drift.
4. Correlate policy changes with:
   - `ack_without_receipt_10s_count`
   - `forced_resync_count`
   - `write_receipt_latency_p95_ms`

## Alert hints
- P1: policy snapshot absent (`recovery_policy_samples_15m = 0`) while chat traffic is present.
- P1: sudden policy drift in `recovery_policy_last_labels` without rollout change.
- P0: policy drift + spike in `ack_without_receipt_10s_count` or `forced_resync_count`.

## Release gates (`chat_get_v11_release_gates`)
Input thresholds (defaults):
1. `p_max_ack_without_receipt_10s_count = 0`
2. `p_max_forced_resync_count = 50`
3. `p_max_write_receipt_latency_p95_ms = 5000`
4. `p_min_recovery_policy_samples_15m = 1`

Output:
1. `gate_p0_ok`
2. `gate_p1_ok`
3. `gate_rollout_ok`
4. `rollout_decision`:
   - `PROCEED`
   - `HOLD_P1`
   - `ROLLBACK_P0`

Use in canary:
1. 1% -> proceed only when `gate_rollout_ok = true`.
2. 10% -> require stable `PROCEED` window before next ramp.
3. Any `ROLLBACK_P0` -> immediate kill switch.

## Rollout control plane
`chat_v11_rollout_control` is a singleton state:
1. `stage`: `canary_1 | canary_10 | canary_50 | full`
2. `kill_switch`: hard stop for v1.1 rollout
3. `note`: operator context

Read:
1. `chat_get_v11_rollout_state()` for dashboards and runtime checks.

Write:
1. `chat_set_v11_rollout_state(stage, kill_switch, note)` by `service_role` only.
2. Any non-service role call must fail with `ERR_FORBIDDEN`.

Journal:
1. Every insert/update of `chat_v11_rollout_control` is logged to `chat_v11_rollout_journal`.
2. `chat_get_v11_rollout_history(limit)` is used for audit/postmortems.
3. Expected usage in incidents:
   - correlate rollout changes with `rollout_decision`, `ack_without_receipt_10s_count`, `forced_resync_count`.
