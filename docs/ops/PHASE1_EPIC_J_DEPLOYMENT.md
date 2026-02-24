# Phase 1 EPIC J: Creator Analytics - Deployment Documentation

**Status**: ✅ Deployed to Production  
**Date**: 2026-02-24  
**Migrations**: 3 (190000, 191000, 192000)  
**Spec Reference**: `docs/specs/phase1/P1J-creator-analytics-v1.md`

---

## Overview

EPIC J provides creators with actionable metrics and insights to improve content quality and increase creator return rate. This is the **analytics foundation** for creator dashboards.

**Key Goals**:
- Transparent metrics (reach, watch quality, satisfaction)
- Actionable insights (retention, hook, safety)
- Time-series tracking (daily snapshots)
- Privacy-respecting (only aggregate data)

**Design Principles**:
- Only count **validated events** (event integrity from Phase 0)
- Nearline updates (batch workers every 15-30 min)
- Neutral, non-judgmental language
- Never reveal algorithm internals

---

## Migrations

### 20260224190000_phase1_j_creator_analytics_schema.sql

**Purpose**: Metrics tables and RPC functions

**Tables Created**:

1. **`reel_metrics`** - Per-reel nearline aggregates
   - Primary key: `reel_id`
   - Metrics categories:
     - **Reach**: `impressions`, `unique_viewers`
     - **Watch quality**: `view_starts`, `viewed_2s`, `watched`, `watched_rate`, `avg_watch_seconds`
     - **Satisfaction**: `likes`, `comments`, `saves`, `shares`
     - **Negative signals**: `hides`, `not_interested`, `reports`
     - **Distribution**: `distribution_by_source` (JSONB), `distribution_by_reason` (JSONB)
   - Indexed: `author_id`, `impressions DESC`, `watched_rate DESC`

2. **`reel_metrics_snapshots`** - Daily snapshots for time-series
   - Primary key: `(reel_id, snapshot_date)`
   - Same metrics as `reel_metrics`
   - Used for 24h/7d/30d analytics windows

3. **`creator_metrics`** - Creator dashboard aggregates
   - Primary key: `creator_id`
   - Aggregates across all reels:
     - **Totals**: `total_reels`, `total_impressions`, `total_liked`, etc.
     - **Averages**: `avg_watched_rate`, `avg_watch_seconds`, `avg_impressions_per_reel`
     - **Audience**: `total_followers`, `followers_growth_7d`, `followers_growth_30d`
     - **Top content**: `top_reel_id`, `top_reel_impressions`

4. **`creator_metrics_snapshots`** - Daily creator growth snapshots
   - Primary key: `(creator_id, snapshot_date)`
   - Same metrics as `creator_metrics`
   - Used for growth trend charts

**RPC Functions**:

- **`get_reel_metrics_v1(reel_id, window)`**
  - Returns: JSONB with metrics breakdown
  - Windows: `'all'`, `'24h'`, `'7d'`, `'30d'`
  - Output structure:
    ```json
    {
      "reel_id": "uuid",
      "window": "7d",
      "reach": {
        "impressions": 1234,
        "unique_viewers": 567
      },
      "watch_quality": {
        "view_starts": 890,
        "viewed_2s": 456,
        "watched": 234,
        "watched_rate": 26.3,
        "avg_watch_seconds": 8.5
      },
      "satisfaction": {
        "likes": 45,
        "comments": 12,
        "saves": 8,
        "shares": 3
      },
      "negative": {
        "hides": 2,
        "not_interested": 1,
        "reports": 0
      },
      "distribution": {
        "by_source": {"following": 120, "explore": 456, "trending": 234},
        "by_reason": {"fresh_creator": 100, "high_trust": 80}
      }
    }
    ```

- **`get_creator_dashboard_v1(creator_id)`**
  - Returns: JSONB with creator dashboard
  - Output structure:
    ```json
    {
      "creator_id": "uuid",
      "totals": {
        "reels": 15,
        "impressions": 12345,
        "watched": 3456
      },
      "averages": {
        "watched_rate": 28.5,
        "watch_seconds": 9.2,
        "impressions_per_reel": 823
      },
      "audience": {
        "followers": 234,
        "growth_7d": 12,
        "growth_30d": 45
      },
      "top_reel": {
        "reel_id": "uuid",
        "impressions": 5678
      }
    }
    ```

---

### 20260224191000_phase1_j_creator_analytics_aggregation.sql

**Purpose**: Background workers to calculate metrics from events

**Functions Created**:

1. **`calculate_reel_metrics_v1(reel_id)`**
   - Calculates all metrics for one reel from validated events
   - Sources:
     - `playback_events`: impressions, views, watch durations
     - `ranking_explanations`: distribution by source/reason (EPIC I integration)
     - `reels`: likes, comments counts
     - `saves`, `shares`, `user_flags`, `reports` tables
   - Upserts to `reel_metrics`

2. **`batch_calculate_reel_metrics_v1(limit, max_age_hours)`**
   - Background worker: batch update reel metrics
   - Defaults: limit=100, max_age_hours=72
   - Targets: new reels (< 72h) + reels with recent activity
   - Schedule: **Run every 15-30 minutes**

3. **`create_reel_metrics_snapshot_v1(reel_id, snapshot_date)`**
   - Creates daily snapshot for one reel
   - Upserts to `reel_metrics_snapshots`

4. **`batch_create_reel_snapshots_v1(snapshot_date, limit)`**
   - Background worker: create daily snapshots for all reels
   - Defaults: snapshot_date=today, limit=1000
   - Schedule: **Run daily at 00:30 UTC**

5. **`calculate_creator_metrics_v1(creator_id)`**
   - Aggregates metrics from all creator's reels
   - Calculates follower growth (if `follows` table exists)
   - Finds top-performing reel (by impressions)
   - Upserts to `creator_metrics`

6. **`batch_calculate_creator_metrics_v1(limit)`**
   - Background worker: batch update creator dashboards
   - Defaults: limit=100
   - Schedule: **Run every 1 hour**

---

### 20260224192000_phase1_j_creator_analytics_insights.sql

**Purpose**: Actionable insights and recommendations

**Functions Created**:

1. **`calculate_retention_insight_v1(reel_id)`**
   - Detects low `watched_rate` (< 30% benchmark)
   - Returns JSONB:
     ```json
     {
       "type": "retention",
       "status": "low",
       "watched_rate": 18.5,
       "benchmark": 30.0,
       "hint": "Большинство зрителей не досматривают до конца. Попробуйте: динамичные первые 3 секунды, яркий визуал, интригующий сюжет.",
       "threshold": 30.0
     }
     ```
   - Minimum data: 20 view_starts

2. **`calculate_hook_insight_v1(reel_id)`**
   - Detects low `view_start_rate` (view_starts/impressions < 40% benchmark)
   - Returns JSONB:
     ```json
     {
       "type": "hook",
       "status": "low",
       "view_start_rate": 25.3,
       "benchmark": 40.0,
       "hint": "Мало кто начинает смотреть. Попробуйте: яркая обложка, крупный текст в первом кадре, эмоциональное выражение лица.",
       "threshold": 40.0
     }
     ```
   - Minimum data: 50 impressions

3. **`calculate_safety_insight_v1(reel_id)`**
   - Detects high `report_rate` (reports/unique_viewers > 5% threshold)
   - Returns JSONB:
     ```json
     {
       "type": "safety",
       "status": "warning",
       "report_rate": 8.5,
       "threshold": 5.0,
       "hint": "Повышенное число жалоб. Проверьте контент на соответствие правилам сообщества.",
       "severity": "high"
     }
     ```
   - Minimum data: 20 unique_viewers

4. **`get_reel_insights_v1(reel_id, user_id)`**
   - Unified RPC: returns all 3 insights (retention, hook, safety)
   - Enforces ownership check (if `user_id` provided)
   - Returns JSONB array:
     ```json
     {
       "reel_id": "uuid",
       "insights": [
         { "type": "retention", "status": "low", ... },
         { "type": "hook", "status": "good", ... },
         { "type": "safety", "status": "good", ... }
       ],
       "generated_at": "2026-02-24T18:00:00Z"
     }
     ```

5. **`get_creator_recommendations_v1(creator_id, limit)`**
   - Returns top improvement opportunities (recent reels with issues)
   - Priority 1: Low retention (watched_rate < 30%, view_starts >= 20)
   - Priority 2: Low hook (view_start_rate < 40%, impressions >= 50)
   - Returns: reel_id, opportunity_type, priority, hint, metrics (JSONB)

6. **`get_creator_growth_v1(creator_id, days)`**
   - Returns daily growth trends from snapshots
   - Defaults: days=30
   - Returns: snapshot_date, total_reels, total_impressions, avg_watched_rate, total_followers
   - Used for dashboard charts

7. **`create_creator_metrics_snapshot_v1(creator_id, snapshot_date)`**
   - Creates daily snapshot for one creator
   - Upserts to `creator_metrics_snapshots`

8. **`batch_create_creator_snapshots_v1(snapshot_date, limit)`**
   - Background worker: create daily snapshots for all creators
   - Schedule: **Run daily at 01:00 UTC**

---

## Integration Points

### Phase 0 Integration
- **Event integrity**: Only count validated events from `playback_events`
- **Watch rules**: `watched` = `event_type = 'complete'` (≥50% or ≥3s from Phase 0)
- **Tables**: `playback_events`, `reels`, `saves`, `shares`, `user_flags`, `reports`

### EPIC I Integration (Ranking v2)
- **Reason codes**: `distribution_by_reason` from `ranking_explanations.reason_codes[]`
- **Source pools**: `distribution_by_source` from `ranking_explanations.source_pool`
- Top 5 reason codes tracked per reel

### EPIC L Integration (Trust Profiles)
- Future: Weight metrics by trust_score (filter low-trust spam)
- Not yet implemented (baseline metrics first)

### EPIC K Integration (Moderation v1)
- Future: Show borderline content warnings in safety insights
- Not yet implemented (coming in EPIC K)

---

## Background Workers Schedule

| Worker | Function | Schedule | Purpose |
|--------|----------|----------|---------|
| Reel metrics update | `batch_calculate_reel_metrics_v1(100, 72)` | Every 15-30 min | Update nearline metrics for new/active reels |
| Creator metrics update | `batch_calculate_creator_metrics_v1(100)` | Every 1 hour | Update creator dashboards |
| Reel snapshots | `batch_create_reel_snapshots_v1(CURRENT_DATE, 1000)` | Daily 00:30 UTC | Create daily snapshots for time-series |
| Creator snapshots | `batch_create_creator_snapshots_v1(CURRENT_DATE, 1000)` | Daily 01:00 UTC | Create daily creator growth snapshots |

**Implementation**:
- Use Supabase Edge Functions with `pg_cron` or `setInterval()`
- Start with manual testing, then automate
- Monitor with `SELECT * FROM cron.job_run_details ORDER BY runid DESC LIMIT 10;`

---

## Testing Scenarios

### 1. Calculate per-reel metrics

```sql
-- Simulate some events for a reel
INSERT INTO playback_events (reel_id, user_id, event_type, metadata)
VALUES
  ('00000000-0000-0000-0000-000000000001'::UUID, '11111111-1111-1111-1111-111111111111'::UUID, 'impression', '{}'),
  ('00000000-0000-0000-0000-000000000001'::UUID, '11111111-1111-1111-1111-111111111111'::UUID, 'start', '{}'),
  ('00000000-0000-0000-0000-000000000001'::UUID, '11111111-1111-1111-1111-111111111111'::UUID, 'progress', '{"watch_duration_ms": 5000}'),
  ('00000000-0000-0000-0000-000000000001'::UUID, '11111111-1111-1111-1111-111111111111'::UUID, 'complete', '{"watch_duration_ms": 8000}');

-- Calculate metrics
SELECT calculate_reel_metrics_v1('00000000-0000-0000-0000-000000000001'::UUID);

-- Verify
SELECT * FROM reel_metrics WHERE reel_id = '00000000-0000-0000-0000-000000000001'::UUID;
-- Expected: impressions=1, view_starts=1, watched=1, watched_rate=100
```

### 2. Get reel metrics with time window

```sql
SELECT get_reel_metrics_v1(
  '00000000-0000-0000-0000-000000000001'::UUID,
  '7d'
);
-- Returns JSONB with reach, watch_quality, satisfaction, negative, distribution
```

### 3. Get creator dashboard

```sql
SELECT get_creator_dashboard_v1('11111111-1111-1111-1111-111111111111'::UUID);
-- Returns JSONB with totals, averages, audience, top_reel
```

### 4. Get reel insights (low retention)

```sql
-- Simulate low retention (only 20% watched)
UPDATE reel_metrics
SET watched_rate = 20.0, view_starts = 100, watched = 20
WHERE reel_id = '00000000-0000-0000-0000-000000000001'::UUID;

SELECT get_reel_insights_v1(
  '00000000-0000-0000-0000-000000000001'::UUID,
  '11111111-1111-1111-1111-111111111111'::UUID
);
-- Expected: retention insight with status='low', hint in Russian
```

### 5. Get creator recommendations

```sql
SELECT * FROM get_creator_recommendations_v1(
  '11111111-1111-1111-1111-111111111111'::UUID,
  5
);
-- Returns top 5 improvement opportunities (retention, hook)
```

### 6. Get creator growth trends

```sql
-- Create snapshots for last 7 days
SELECT batch_create_creator_snapshots_v1(CURRENT_DATE, 1000);

SELECT * FROM get_creator_growth_v1(
  '11111111-1111-1111-1111-111111111111'::UUID,
  7
);
-- Returns daily metrics for last 7 days
```

### 7. Batch workers

```sql
-- Test reel metrics batch update
SELECT * FROM batch_calculate_reel_metrics_v1(10, 72);

-- Test creator metrics batch update
SELECT * FROM batch_calculate_creator_metrics_v1(10);

-- Test reel snapshots batch
SELECT * FROM batch_create_reel_snapshots_v1(CURRENT_DATE, 10);

-- Test creator snapshots batch
SELECT * FROM batch_create_creator_snapshots_v1(CURRENT_DATE, 10);
```

---

## Frontend Integration Guide

### Creator Dashboard (`/creator/analytics`)

**Components to build**:

1. **MetricsOverview**
   - Fetch: `get_creator_dashboard_v1(creator_id)`
   - Display: Total reels, impressions, followers
   - Highlight: Avg watched_rate, avg impressions/reel

2. **GrowthChart**
   - Fetch: `get_creator_growth_v1(creator_id, 30)`
   - Chart: Line chart with impressions, watched_rate, followers over time
   - Library: `recharts` or `chart.js`

3. **TopOpportunities**
   - Fetch: `get_creator_recommendations_v1(creator_id, 5)`
   - Display: List of reels with improvement hints
   - Action: Navigate to reel insights

### Reel Insights (`/reel/:id/insights`)

**Components to build**:

1. **ReelMetrics**
   - Fetch: `get_reel_metrics_v1(reel_id, '7d')`
   - Display: Reach (impressions, unique viewers), Watch quality (watched_rate, avg watch seconds), Satisfaction (likes, comments, saves)

2. **ReelInsights**
   - Fetch: `get_reel_insights_v1(reel_id, user_id)`
   - Display: Retention insight, Hook insight, Safety insight
   - UI: Card-based with status badges (low/good/warning)

3. **DistributionBreakdown**
   - Fetch: `get_reel_metrics_v1(reel_id, 'all')`
   - Display: Pie chart of distribution_by_source
   - Display: Bar chart of top 5 distribution_by_reason

**Example React usage**:

```tsx
import { supabase } from '@/integrations/supabase/client';

async function getCreatorDashboard(creatorId: string) {
  const { data, error } = await supabase.rpc('get_creator_dashboard_v1', {
    p_creator_id: creatorId
  });
  
  if (error) throw error;
  return data;
}

async function getReelInsights(reelId: string, userId: string) {
  const { data, error } = await supabase.rpc('get_reel_insights_v1', {
    p_reel_id: reelId,
    p_user_id: userId
  });
  
  if (error) throw error;
  return data;
}
```

---

## Troubleshooting

### Metrics not updating

**Symptoms**: `reel_metrics` table is empty or stale

**Causes**:
1. Background workers not running
2. No validated events in `playback_events`
3. Reels created before EPIC J deployment

**Solutions**:
1. Manually run batch update:
   ```sql
   SELECT * FROM batch_calculate_reel_metrics_v1(100, 720);  -- Last 30 days
   ```
2. Verify events exist:
   ```sql
   SELECT COUNT(*) FROM playback_events WHERE reel_id = '<reel_id>';
   ```
3. Check event types:
   ```sql
   SELECT event_type, COUNT(*) FROM playback_events GROUP BY event_type;
   -- Expected: impression, start, progress, complete
   ```

### Insights always 'insufficient_data'

**Symptoms**: `get_reel_insights_v1()` returns `status: 'insufficient_data'` for all insights

**Causes**:
1. Reel has too few impressions (< 50) or views (< 20)
2. Metrics not calculated yet

**Solutions**:
1. Check minimum thresholds:
   - Retention insight: 20 view_starts
   - Hook insight: 50 impressions
   - Safety insight: 20 unique_viewers
2. Calculate metrics:
   ```sql
   SELECT calculate_reel_metrics_v1('<reel_id>');
   ```

### Time-series data missing

**Symptoms**: `get_creator_growth_v1()` returns empty or incomplete data

**Causes**:
1. Daily snapshot workers not running
2. Snapshots not created for recent dates

**Solutions**:
1. Manually create snapshots:
   ```sql
   SELECT * FROM batch_create_reel_snapshots_v1(CURRENT_DATE, 1000);
   SELECT * FROM batch_create_creator_snapshots_v1(CURRENT_DATE, 1000);
   ```
2. Verify snapshots exist:
   ```sql
   SELECT snapshot_date, COUNT(*) FROM reel_metrics_snapshots GROUP BY snapshot_date ORDER BY snapshot_date DESC;
   ```

### Distribution data empty

**Symptoms**: `distribution_by_source` and `distribution_by_reason` are `{}`

**Causes**:
1. No entries in `ranking_explanations` table (EPIC I not deployed or not running)
2. Reels served from pools without explanations

**Solutions**:
1. Verify EPIC I deployed:
   ```sql
   SELECT COUNT(*) FROM ranking_explanations;
   ```
2. Check if ranking v2 is active:
   ```sql
   SELECT source_pool, COUNT(*) FROM ranking_explanations GROUP BY source_pool;
   ```

---

## Metrics to Track

### Creator Dashboard KPIs

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Creator dashboard open rate** | > 40% | % of creators who opened dashboard in last 7d |
| **Insights click-through rate** | > 50% | % of creators who clicked on insight hint |
| **Improvement conversion** | > 20% | % of creators who uploaded new reel after seeing insight |
| **Dashboard return rate** | > 60% | % of creators who opened dashboard 2+ times in 7d |

### Platform Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Avg creator reels/week** | > 2 | `AVG(total_reels / weeks_active)` from `creator_metrics` |
| **Creator churn rate** | < 30% | % of creators inactive for 30+ days |
| **Top creator concentration** | < 50% | % of impressions from top 10% creators |

---

## Rollout Strategy

### Phase 1: Backend Ready (Current)

- ✅ Migrations deployed
- ✅ Background workers defined (not yet scheduled)
- ⬜ Manual testing with sample data

**Next Steps**:
1. Create test creator accounts
2. Generate sample events and metrics
3. Verify all RPC functions work

### Phase 2: Background Workers (Week 1)

- ⬜ Schedule `batch_calculate_reel_metrics_v1()` (every 15 min)
- ⬜ Schedule `batch_calculate_creator_metrics_v1()` (every 1h)
- ⬜ Schedule `batch_create_reel_snapshots_v1()` (daily 00:30 UTC)
- ⬜ Schedule `batch_create_creator_snapshots_v1()` (daily 01:00 UTC)
- ⬜ Monitor worker performance

**Success Criteria**:
- Metrics update within 30 minutes of new events
- Daily snapshots created for all active creators
- No worker timeouts or errors

### Phase 3: Frontend Beta (Week 2)

- ⬜ Build Creator Dashboard UI (`/creator/analytics`)
- ⬜ Build Reel Insights UI (`/reel/:id/insights`)
- ⬜ Beta test with 20% of creators (high-trust only)

**Success Criteria**:
- Dashboard open rate > 40%
- Insights click-through rate > 50%
- No major UI bugs

### Phase 4: Full Rollout (Week 3)

- ⬜ Enable for 100% of creators
- ⬜ Announce in creator newsletter
- ⬜ Monitor creator engagement

**Success Criteria**:
- Creator dashboard open rate > 40%
- Creator return rate > 60%
- Improvement conversion > 20%

---

## Dependencies

### Required (Must be deployed)
- ✅ Phase 0: Event integrity, playback events
- ✅ EPIC I: Ranking v2 (reason codes, source pools)
- ✅ `reels`, `saves`, `shares`, `user_flags`, `reports` tables

### Optional (Enhanced features)
- ⬜ EPIC L: Trust scores (for weighted metrics in future)
- ⬜ EPIC K: Moderation (for borderline content warnings)
- ⬜ `follows` table (for follower counts)

---

## Next Actions

1. **Schedule background workers** (HIGH PRIORITY):
   - Implement Supabase Edge Function or pg_cron for batch updates
   - Start with manual testing, then automate

2. **Seed sample data** (MEDIUM PRIORITY):
   - Backfill metrics for existing reels (last 30 days)
   - Create snapshots for historical data

3. **Frontend implementation** (MEDIUM PRIORITY):
   - Creator Dashboard page
   - Reel Insights page
   - Growth charts

4. **Testing** (HIGH PRIORITY):
   - Test all RPC functions with real data
   - Verify insights accuracy
   - Load test batch workers

5. **Monitoring** (MEDIUM PRIORITY):
   - Track worker execution times
   - Alert on failed batches
   - Dashboard for platform metrics

---

## Files Changed

- `supabase/migrations/20260224190000_phase1_j_creator_analytics_schema.sql` (NEW - 462 lines)
- `supabase/migrations/20260224191000_phase1_j_creator_analytics_aggregation.sql` (NEW - 565 lines)
- `supabase/migrations/20260224192000_phase1_j_creator_analytics_insights.sql` (NEW - 612 lines)

**Total**: 3 migrations, 1639 lines of SQL, 21 tables/functions deployed

---

## Appendix: Metrics Definitions

### Reach Metrics
- **impressions**: Count of `impression` or `served` events
- **unique_viewers**: Count of distinct `user_id` with impressions

### Watch Quality Metrics
- **view_starts**: Count of `start` or `play` events
- **viewed_2s**: Count of `progress` events with `watch_duration_ms >= 2000`
- **watched**: Count of `complete` events (watched ≥50% or ≥3s)
- **watched_rate**: `(watched / view_starts) * 100`
- **avg_watch_seconds**: `SUM(watch_duration_ms) / view_starts / 1000`

### Satisfaction Metrics
- **likes**: From `reels.likes_count`
- **comments**: From `reels.comments_count`
- **saves**: Count from `saves` table
- **shares**: Count from `shares` table

### Negative Metrics
- **hides**: Count from `user_flags` where `flag_type = 'hide'`
- **not_interested**: Count from `user_flags` where `flag_type = 'not_interested'`
- **reports**: Count from `reports` table

### Distribution Metrics
- **by_source**: Breakdown by `ranking_explanations.source_pool` (following, explore, trending, etc.)
- **by_reason**: Top 5 reason codes from `ranking_explanations.reason_codes[]`

---

**End of EPIC J Deployment Documentation**
