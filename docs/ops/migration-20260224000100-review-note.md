# Migration Review Note: 20260224000100_fix_compute_user_spam_score_v1_override_nulls

## Summary
Migration updates `public.compute_user_spam_score_v1` to prevent trust weight override from becoming NULL when no active override row exists.

## Quick verdict
- Functional intent: valid and low-risk.
- Change type: CREATE OR REPLACE FUNCTION only (no DDL on tables/indexes/policies).
- Data risk: low (read-time scoring behavior change only).

## Findings
1. Positive
- Uses COALESCE-wrapped scalar subquery for override fetch; no-row case preserves prior `v_trust_weight`.
- Keeps grant on function to `authenticated, service_role`.
- No destructive operations.

2. Watchpoints
- `RETURNS TABLE` includes `policy_applied TEXT`; function currently defaults to `'default'` if policy missing, which may mask policy misconfig.
- `p_policy_id` is reassigned in function body when NULL; behavior is consistent but should be documented for auditability.
- Depends on anti-abuse tables (`anti_abuse_policies`, `spam_indicators`, `coordinated_behavior_clusters`, `trust_weight_overrides`) existing with expected columns.

## Pre-apply checks
1. Run function regression on known users:
- no override
- active override
- expired override
2. Compare score/trust output before/after on sample set.
3. Ensure no downstream service expects NULL `trust_weight` semantics.

## Recommendation
- Apply in separate controlled change after brief regression run.
- Keep in dedicated PR/migration batch (not mixed with chat rollout migrations).
