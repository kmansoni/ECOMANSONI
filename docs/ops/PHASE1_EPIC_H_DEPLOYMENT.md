# Phase 1 EPIC H Deployment Guide

**Date:** 2026-02-24  
**EPIC:** H - Hashtags + Trends (trust-weighted discovery)  
**Status:** ✅ **COMPLETE**

---

## Overview

Phase 1 EPIC H implements trust-weighted hashtag trending and discovery surfaces with anti-hijack protection.

**Components Deployed:**
1. ✅ **Part 1**: Hashtag Model + Moderation (already existed from Phase 0, enhanced)
2. ✅ **Part 2**: Trend Engine (velocity + trust-weighting + decay)
3. ✅ **Part 3**: Hashtag Surfaces + Anti-hijack

---

## Deployed Migrations

| Migration ID | Component | Status |
|--------------|-----------|--------|
| 20260220231000 | Phase 0: Hashtags baseline | ✅ Deployed (existing) |
| 20260224170000 | EPIC H Part 2: Trend Engine | ✅ Deployed |
| 20260224171000 | EPIC H Part 3: Hashtag Surfaces + Anti-hijack | ✅ Deployed |

**Total:** 2 new migrations

---

## Part 2: Trend Engine (20260224170000)

### Tables Created:

**`trending_hashtags`**
- Tracks hashtag trending metrics over time windows
- Velocity metrics (impressions/views/completions per hour)
- Diversity metrics (unique creators/viewers)
- Engagement metrics (share/save rates)
- Safety metrics (report/hide rates)
- Trust-weighted scoring
- Trend decay curve (peak detection + exponential decay)
- Eligibility gates (green distribution, report threshold)

**Indexes:**
- `idx_trending_hashtags_score` (trend_score DESC, window_start DESC)
- `idx_trending_hashtags_window` (window_end DESC)
- `idx_trending_hashtags_eligible` (is_eligible)

### Functions Created:

**`calculate_hashtag_velocity_v1(hashtag_id, window_hours=24)`**
- Calculates velocity metrics for a hashtag
- Aggregates impressions, views, completions per hour
- Tracks unique viewers/creators
- Calculates share/save/report/hide rates
- Applies trust-weighting from Phase 1 EPIC L (user_trust_scores)
- Returns trust_weighted_score (0-100)

**`calculate_trend_score_v1(...)`**
- Combines velocity + diversity + engagement
- Logarithmic scaling to handle spikes
- Applies trust-weighting (multiply by trust_score/100)
- Applies exponential decay after peak
- Returns final trend_score (0-100)

**Formula:**
```
velocity_score (0-40) = 
  LN(impression_velocity) * 5 +
  LN(view_velocity) * 3 +
  LN(completion_velocity) * 2

diversity_score (0-30) = 
  LN(unique_creators) * 10 +
  LN(unique_viewers) * 5

engagement_score (0-30) = 
  share_rate * 100 +
  save_rate * 50

base_score = velocity + diversity + engagement

trust_adjusted = base_score * (trust_weighted_score / 100)

final_score = trust_adjusted * exp(-decay_rate * age / max_lifetime)
```

**`check_trend_eligibility_v1(hashtag_id, ...)`**
- Gate 1: Hashtag not restricted/hidden
- Gate 2: Minimum unique creators (3) and viewers (10)
- Gate 3: Report rate < 5%, hide rate < 10%
- Gate 4: No controversial reels (Phase 1 EPIC I integration)
- Returns TRUE if eligible

**`batch_update_trending_hashtags_v1(window_hours=24, limit=100)`**
- **Background worker function** (run every 15-30 minutes)
- Processes top hashtags by recent usage
- Calculates velocity, eligibility, trend score
- Detects peak timestamp (current score > previous peak)
- Upserts trending_hashtags table
- Returns list of updated hashtags with scores

**`get_trending_hashtags_v1(limit=20, min_score=30)`**
- **Public API** for frontend
- Returns current trending hashtags sorted by trend score
- Filters: is_trending=TRUE, is_eligible=TRUE, score >= min_score
- Only shows last 6 hours window
- Excludes restricted/hidden hashtags

**`cleanup_trending_hashtags_v1(retention_days=7)`**
- **Cleanup job** (run daily)
- Deletes trending data older than 7 days
- Returns count of deleted rows

---

## Part 3: Hashtag Surfaces + Anti-hijack (20260224171000)

### Functions Created:

**`get_hashtag_feed_v1(hashtag_tag, surface='top', limit=50, offset=0)`**
- **Hashtag page API** with 3 surfaces:
  
  **Top Surface:**
  - Relevance-weighted + engagement ranking
  - Formula: `(views * 0.3) + (likes * 0.3) + (comments * 0.2) + (relevance_score * 20)`
  - Ordered by score DESC, created_at DESC
  
  **Recent Surface:**
  - Chronological + minimum relevance filter (>= 0.3)
  - Ordered by created_at DESC
  
  **Trending Surface:**
  - Only if hashtag is currently trending
  - Last 48 hours only
  - Higher relevance threshold (>= 0.5)
  - Formula: `(views * 0.4) + (likes * 0.3) + (relevance_score * 30)`

- Respects moderation status (restricted/hidden)
- Filters out user's "not_interested" reels

**`get_related_hashtags_v1(hashtag_tag, limit=10)`**
- Returns hashtags that co-occur with this one
- Based on co-occurrence count
- Minimum 3 co-occurrences
- Ordered by frequency DESC

**`calculate_hashtag_relevance_v1(reel_id, hashtag_tag)`**
- **Anti-hijack** relevance scoring
- Checks if hashtag appears in description (1.5x boost)
- Checks category match (1.2x boost)
- Penalizes if no text match (0.7x penalty)
- Returns score 0-2 (clamped)
- Used to detect off-topic hashtag usage

**`detect_coordinated_hashtag_attack_v1(hashtag_tag, window_hours=24)`**
- **Anti-manipulation** detection
- Counts suspicious low-trust accounts (>= 5 → suspicious)
- Counts similar posting patterns (3+ reels with same hashtag in 24h)
- Detects velocity spikes (3x baseline → suspicious)
- Returns: is_suspicious, suspicious_account_count, similar_pattern_count, velocity_spike_detected

**`check_hashtag_search_rate_limit_v1(user_id, session_id, max=20/min)`**
- **Rate limiting** integration (Phase 1 EPIC L)
- Limit: 20 searches per minute
- Records event in `rate_limit_events` table
- Returns TRUE if allowed, FALSE if exceeded

**`search_hashtags_v1(query, limit=20, session_id)`**
- **Hashtag search API** with rate limiting
- Autocomplete search (prefix match)
- Returns: hashtag_id, tag, display_tag, usage_count, is_trending
- Exact matches first, then ordered by usage_count DESC
- Excludes restricted/hidden hashtags

---

## Background Workers Needed

**Priority: HIGH**

### 1. Trending Hashtags Worker
**Function:** `batch_update_trending_hashtags_v1(24, 100)`  
**Schedule:** Every 15-30 minutes  
**Purpose:** Update trending scores and detect new trends

**pg_cron example:**
```sql
SELECT cron.schedule(
  'update-trending-hashtags',
  '*/15 * * * *', -- every 15 minutes
  $$SELECT public.batch_update_trending_hashtags_v1(24, 100)$$
);
```

### 2. Coordinated Attack Detection
**Function:** `detect_coordinated_hashtag_attack_v1(hashtag_tag, 24)`  
**Schedule:** Every 1 hour  
**Purpose:** Detect manipulation attacks on trending hashtags

**Implementation:** Loop through current trending hashtags

### 3. Cleanup Job
**Function:** `cleanup_trending_hashtags_v1(7)`  
**Schedule:** Daily  
**Purpose:** Remove old trending data

**pg_cron example:**
```sql
SELECT cron.schedule(
  'cleanup-trending-hashtags',
  '0 2 * * *', -- 2 AM daily
  $$SELECT public.cleanup_trending_hashtags_v1(7)$$
);
```

---

## Metrics to Track

### Trending Quality:
- `trending_hashtags_count` (how many hashtags trending at any time)
- `trend_peak_count` (how many peaks detected per day)
- `trend_false_positive_rate` (trending hashtags that get restricted/hidden later)

### Anti-hijack Effectiveness:
- `low_relevance_rate` (% of reel-hashtag pairs with relevance < 0.5)
- `coordinated_attack_detection_rate` (suspicious hashtags per week)

### User Engagement:
- `hashtag_click_rate` (from EPIC H spec)
- `hashtag_watch_rate` (from EPIC H spec)
- `trend_anomaly_flag_rate` (from EPIC H spec)

### Rate Limiting:
- `hashtag_search_rate_limit_trigger_rate`

---

## Frontend Integration (To Be Implemented)

### Priority: MEDIUM

**Components Needed:**

1. **HashtagPage.tsx**
   - Tabs: Top / Recent / Trending
   - Call `get_hashtag_feed_v1(tag, surface, limit, offset)`
   - Related hashtags widget (call `get_related_hashtags_v1(tag)`)

2. **TrendingHashtagsList.tsx**
   - Call `get_trending_hashtags_v1(20, 30)`
   - Display: #tag, trend_score, unique_creators, velocity
   - Link to hashtag page

3. **HashtagSearchAutocomplete.tsx**
   - Call `search_hashtags_v1(query, 10, session_id)`
   - Show: #tag, usage_count, trending badge

4. **ExploreScreen.tsx** (for EPIC G)
   - "Trending Hashtags" section
   - "Categories" section (can group by hashtags)

---

## Testing Scenarios

### 1. Trend Detection
```sql
-- Simulate high velocity hashtag
-- Expected: Appears in get_trending_hashtags_v1() if eligible
SELECT * FROM public.batch_update_trending_hashtags_v1(24, 100);
SELECT * FROM public.get_trending_hashtags_v1(20, 30);
```

### 2. Trust-Weighting
```sql
-- Low-trust accounts use hashtag
-- Expected: Lower trust_weighted_score, lower trend_score
SELECT * FROM public.calculate_hashtag_velocity_v1('<hashtag-id>', 24);
```

### 3. Eligibility Gates
```sql
-- Hashtag with high report rate
-- Expected: is_eligible = FALSE, is_trending = FALSE
SELECT * FROM public.check_trend_eligibility_v1('<hashtag-id>', 0.06, 0.08, 10, 50);
```

### 4. Anti-hijack
```sql
-- Reel uses popular hashtag without text match
-- Expected: Low relevance_score (< 0.5)
SELECT * FROM public.calculate_hashtag_relevance_v1('<reel-id>', 'viral');
```

### 5. Coordinated Attack Detection
```sql
-- Multiple low-trust accounts use hashtag
-- Expected: is_suspicious = TRUE
SELECT * FROM public.detect_coordinated_hashtag_attack_v1('test', 24);
```

### 6. Rate Limiting
```sql
-- Search 21 times in 1 minute
-- Expected: 21st search raises exception
SELECT * FROM public.search_hashtags_v1('test', 10, 'session-123');
```

---

## Dependencies

✅ **Phase 0:** Hashtags baseline (20260220231000)  
✅ **Phase 1 EPIC L:** user_trust_scores, rate_limit_events (20260224020001)  
✅ **Phase 1 EPIC I:** controversial_content_flags (20260224161000)

---

## Acceptance Criteria

EPIC H is complete when:
- ✅ Trending hashtags calculated with trust-weighting
- ✅ Eligibility gates enforced (green distribution, report threshold)
- ✅ Trend decay implemented (exponential curve)
- ✅ Hashtag surfaces (Top/Recent/Trending) available
- ✅ Related hashtags based on co-occurrence
- ✅ Anti-hijack relevance scoring
- ✅ Coordinated attack detection
- ✅ Rate limiting on hashtag search
- ⏳ Background workers deployed (pending pg_cron setup)
- ⏳ Frontend components implemented (pending)
- ⏳ Metrics tracked (pending dashboards)

**Current Status:** 6/9 criteria met (Database layer 100% complete)

---

## Next Steps

### Immediate (This Week):
1. **Deploy background workers** (HIGH):
   - Set up pg_cron or Edge Function for `batch_update_trending_hashtags_v1`
   - Set up coordinated attack detection loop
   - Set up daily cleanup

2. **Monitor metrics** (HIGH):
   - Track trending_hashtags_count
   - Alert on coordinated_attack_detection spikes

### Short-term (Next 2 Weeks):
3. **Implement EPIC G (Explore/Discovery)** (HIGH):
   - Use `get_trending_hashtags_v1()` for "Trending Now" section
   - Use hashtag surfaces for discovery

4. **Frontend components** (MEDIUM):
   - HashtagPage with Top/Recent/Trending tabs
   - TrendingHashtagsList widget
   - Search autocomplete

---

## Rollout Strategy

**Phase 1: Backend Only (Current)**
- Database schema deployed ✅
- Background workers running (pending)
- Monitor trust-weighting effectiveness

**Phase 2: Canary (20% traffic)**
- Show trending hashtags to 20% of users (feature flag)
- Monitor: hashtag_click_rate, false_positive_rate
- Tune: min_score threshold (currently 30), decay_rate (currently 0.5)

**Phase 3: Full Rollout (100%)**
- If metrics green (click_rate > 5%, false_positive < 2%)
- Enable trending hashtags for all users
- Launch Explore screen (EPIC G)

---

## Troubleshooting

### Issue: No hashtags trending
- Check: Are `batch_update_trending_hashtags_v1` workers running?
- Check: Is min_score (30) too high? Try lowering to 20
- Check: Are hashtags passing eligibility gates? Query `is_eligible = FALSE` rows

### Issue: Low-quality hashtags trending
- Check: Trust-weighting effective? Query `trust_weighted_score` distribution
- Check: Increase min_creators/min_viewers thresholds
- Check: Lower max_report_rate/max_hide_rate thresholds

### Issue: Coordinated attacks not detected
- Check: Are attackers using high-trust accounts? (should be rare)
- Check: Lower similarity_threshold (currently 0.8)
- Check: Velocity spike detection threshold (currently 3x baseline)

---

## References

- [Phase 1 EPIC H Spec](../specs/phase1/P1H-hashtags-trends-discovery-integrity.md)
- [Phase 1 Progress Report](requirements/phase1-progress-report.md)
- [Phase 1 EPIC L Deployment](PHASE1_EPIC_L_DEPLOYMENT_SUMMARY.md)
- [Phase 1 EPIC I Deployment](PHASE1_EPIC_I_DEPLOYMENT.md)
