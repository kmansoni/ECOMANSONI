# Phase 1 EPIC K: Moderation v1 — Deployment

**Status**: ✅ Deployed to Production  
**Date**: 2026-02-24  
**Spec**: [docs/specs/phase1/P1K-moderation-queues-sla-appeals-borderline.md](docs/specs/phase1/P1K-moderation-queues-sla-appeals-borderline.md)

---

## Overview

EPIC K upgrades moderation from Phase 0 “blocked/allowed” to an operationally sustainable v1 system:

- Decisions: `allow` / `restrict` / `needs_review` / `block`
- Distribution classes: `green` / `borderline` / `red`
- Borderline enforcement: **borderline never appears in recommendation surfaces**
- Trust-weighted reports + burst detection (mass-report guard)
- Appeals lifecycle with SLA metrics

Primary product objective: growth without toxic amplification, while resisting weaponized reporting.

---

## Migrations

### 20260224200000_phase1_k_moderation_queues_sla_borderline.sql

**Purpose**: Core moderation layer (queues + enforcement + mass-report guard)

**Types**:
- `public.moderation_decision`: `allow | restrict | needs_review | block`
- `public.distribution_class`: `green | borderline | red`

**Tables**:
- `content_moderation_status`
  - Current decision + distribution class per content item
  - PK: `(content_type, content_id)`
- `content_moderation_actions`
  - Append-only audit trail of decisions
- `moderation_queue_items`
  - Queue items (priority, status, report_weight_sum, burst flags)
- `content_reports_v1`
  - Trust-weighted user reports
- `moderation_reporter_quality`
  - Reporter quality score used to down-weight abusive reporters

**Core Functions**:
- `map_decision_to_distribution_class_v1(decision)`
- `get_reporter_quality_multiplier_v1(reporter_id)`
- `calculate_report_weight_v1(reporter_id)`
- `submit_content_report_v1(content_type, content_id, report_type, description)`
  - Trust-weighted report insert
  - Queue upsert
  - Burst detection (10 min window)
  - Auto-escalation to `needs_review` (never auto-block)
- `set_content_moderation_decision_v1(...)`
  - Writes `content_moderation_actions` + updates `content_moderation_status`
  - Resolves queue item
- `get_content_distribution_class_v1(content_type, content_id)`
- `is_reel_discoverable_v1(reel_id)`
  - Central eligibility gate for recommendation surfaces

**Server-side Enforcement (critical)**:
- `get_reels_feed_v2` redefined to:
  - re-enable moderation + visibility gating (channel membership + sensitive flags)
  - enforce `content_moderation_status.distribution_class = 'green'`
- `get_hashtag_feed_v1` redefined to enforce `is_reel_discoverable_v1(reel_id)`
- Explore helpers redefined:
  - `get_explore_fresh_creators_v1`
  - `get_explore_categories_v1`

---

### 20260224201000_phase1_k_moderation_appeals.sql

**Purpose**: Appeals lifecycle

**Types**:
- `public.appeal_status`: `submitted | in_review | accepted | rejected`
- `public.appeal_reason`: `false_positive | context_missing | policy_unclear | technical_error | other`

**Tables**:
- `moderation_appeals`
  - References `content_moderation_actions(id)` (optional)
  - Stores original + new decisions/classes
- `appeal_rate_limits`
  - Anti-spam rate limiting (default: 5 appeals / 24h)

**Functions**:
- `submit_appeal_v1(...)`
  - Ownership checks (reel/profile)
  - Rate limiting
- `review_appeal_v1(appeal_id, moderator_admin_id, decision, ...)`
  - Service-only
  - On accept: uses `set_content_moderation_decision_v1(..., allow, source=appeal)`
- `get_pending_appeals_v1(limit)` (service-only)
- `get_my_appeals_v1(limit)` (authenticated)
- `calculate_appeal_sla_v1(window_days)` (service-only)

---

## Surface Matrix (Phase 1 enforcement)

**Green** (`distribution_class = green`)
- Feed ✅
- Explore ✅
- Hashtag surfaces ✅

**Borderline** (`distribution_class = borderline`)
- Feed ❌ (server-side enforced)
- Explore ❌ (server-side enforced)
- Hashtag surfaces ❌ (server-side enforced)

**Red** (`distribution_class = red`)
- Feed ❌
- Explore ❌
- Hashtag surfaces ❌

Note: Owner-only view and direct link behavior are governed by existing RLS/read paths and can be tightened later if needed.

---

## How to Use

### Report content (client-side)

```sql
select public.submit_content_report_v1('reel', '<reel_uuid>'::uuid, 'spam', 'Спам');
```

### Moderator action (service role)

```sql
select public.set_content_moderation_decision_v1(
  'reel',
  '<reel_uuid>'::uuid,
  'restrict'::public.moderation_decision,
  'policy_nudity',
  'human',
  null,
  'Borderline content'
);
```

### Submit appeal (authenticated)

```sql
select public.submit_appeal_v1(
  null,
  'reel',
  '<reel_uuid>'::uuid,
  'false_positive'::public.appeal_reason,
  'Контент не нарушает правила.'
);
```

---

## KPIs / Guardrails

Suggested metrics from spec:
- `moderation_queue_lag_minutes`
- `appeal_turnaround_hours`
- `borderline_leak_rate` (target ~0)
- `mass_report_attack_flag_rate`
- `report_to_action_time_minutes`

---

## Next Steps

1. **Schedule workers / operational loop**
   - Periodic dashboard for `moderation_queue_items` (open → assigned → resolved)
   - Add automated triage if needed
2. **Reporter quality updates on resolution**
   - Update `moderation_reporter_quality` based on outcomes (accept/reject signals)
3. **Direct link/share surface tightening (Phase 1 follow-up)**
   - Default spec says Share ❌ for borderline

---

## Files

- `supabase/migrations/20260224200000_phase1_k_moderation_queues_sla_borderline.sql`
- `supabase/migrations/20260224201000_phase1_k_moderation_appeals.sql`
