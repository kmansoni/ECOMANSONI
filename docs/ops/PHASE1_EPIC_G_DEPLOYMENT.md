# Phase 1 EPIC G Deployment Guide

**Date:** 2026-02-24  
**EPIC:** G - Explore/Discovery Surface  
**Status:** ✅ **BACKEND COMPLETE** (Frontend Pending)

---

## Overview

Phase 1 EPIC G implements pull-based discovery surface with categories, trending hashtags, fresh creators, and safety enforcement.

**Components Deployed:**
1. ✅ **Part 1**: Explore Enhancements (categories, EPIC H integration, safety)
2. ✅ **Part 2**: Analytics & Metrics (sessions, clicks, metric calculations)

---

## Deployed Migrations

| Migration ID | Component | Status |
|--------------|-----------|--------|
| 20260224180000 | EPIC G Part 1: Explore Enhancements | ✅ Deployed |
| 20260224181000 | EPIC G Part 2: Analytics & Metrics | ✅ Deployed |

**Total:** 2 new migrations

---

## Part 1: Explore Enhancements (20260224180000)

### Tables Created:

**`hashtag_categories`**
- Defines topic clusters (Entertainment, Music, Dance, Comedy, Food, etc.)
- 15 seed categories with Russian & English names
- Icons for UI rendering
- Active/inactive toggle for category management

**`hashtag_category_mapping`**
- Many-to-many mapping between hashtags and categories
- Relevance score (0-1) for ranking
- Enables "Categories" section in Explore

**Indexes:**
- `idx_hashtag_categories_active` (is_active, sort_order)
- `idx_hashtag_category_mapping_category` (category_id, relevance_score DESC)
- `idx_hashtag_category_mapping_hashtag` (hashtag_id)

### Functions Created:

**`get_explore_fresh_creators_v1(limit=12, min_reels=3, min_trust=30, max_age=30)`**
- Returns fresh creators for Explore
- Quality filter: min 3 published reels
- Trust filter: trust_score >= 30 (integrates EPIC L `trust_profiles`)
- Age filter: created in last 30 days
- Returns: user_id, display_name, avatar_url, reels_count, trust_score, created_at

**`get_explore_categories_v1(limit_categories=6, limit_reels_per_category=5)`**
- Returns top categories with reels for each
- Safety enforcement: only green content (no controversial flags from EPIC I)
- Returns JSONB: category_id, category_name, display_name, icon_name, reels[]

**`get_explore_page_v2(user_id, segment_id, locale, country, allow_stale, force_refresh)`**
- **Unified Explore API** (replaces Phase 0 get_explore_page_v1)
- 5 sections:
  1. **Trending Now**: Uses `get_trending_hashtags_v1()` from EPIC H (trust-weighted)
  2. **Hashtags**: Top 20 by usage_count (normal status only)
  3. **Fresh Creators**: New accounts with quality filter (EPIC G)
  4. **Categories**: Topic clusters with top reels (EPIC G)
  5. **Recommended Reels**: Safe pool with higher exploration ratio (0.40 vs feed 0.20)

- **Integrates:**
  - EPIC H: trust-weighted trending hashtags
  - EPIC L: trust scores for fresh creators
  - EPIC I: controversial content filter (only green reels)
  
- **Caching:** 120-second TTL in `explore_cache_entries`
- **Algorithm version:** `v2.epic-g`

---

## Part 2: Analytics & Metrics (20260224181000)

### Tables Created:

**`explore_sessions`**
- Tracks Explore browsing sessions
- Fields: session_id, user_id, session_key, started_at, ended_at, duration_seconds
- Tracks: sections_viewed[], sections_clicked[], total_clicks, total_watches
- Algorithm version for A/B testing

**`explore_section_clicks`**
- Tracks individual clicks on Explore items
- Fields: session_id, user_id, section_type, item_type, item_id, position_in_section
- Watch tracking: did_watch, watch_duration_seconds
- Section types: trending_now, hashtags, fresh_creators, categories, recommended_reels
- Item types: reel, hashtag, creator, category

**Indexes:**
- `idx_explore_sessions_user` (user_id, started_at DESC)
- `idx_explore_sessions_started` (started_at DESC)
- `idx_explore_section_clicks_session` (session_id, clicked_at DESC)
- `idx_explore_section_clicks_section` (section_type, clicked_at DESC)

### Functions Created:

**Session Management:**
- `start_explore_session_v1(user_id, session_key, algorithm_version)` → session_id
- `end_explore_session_v1(session_id)` → boolean (calculates duration)

**Event Tracking:**
- `track_explore_click_v1(session_id, section_type, item_type, item_id, user_id, position, algorithm_version)` → click_id
- `update_explore_watch_v1(click_id, watch_duration_seconds)` → boolean

**Metrics Calculation:**
- `calculate_explore_open_rate_v1(window_days=7)` → % of users who opened Explore
- `calculate_explore_to_watch_rate_v1(window_days=7)` → % of clicks that led to watch
- `calculate_explore_session_length_v1(window_days=7)` → avg duration in seconds
- `calculate_explore_section_distribution_v1(window_days=7)` → breakdown by section (click_count, click_%, avg_position, watch_rate)

---

## Integration Summary

### EPIC H Integration (Hashtags + Trends):
- ✅ `get_explore_page_v2()` uses `get_trending_hashtags_v1()` for "Trending Now"
- ✅ Trust-weighted trending (high/medium/low trust tiers)
- ✅ Decay curve applied (score × e^(-rate × age))

### EPIC L Integration (Trust + Rate Limits):
- ✅ Fresh creators filtered by `trust_profiles.trust_score >= 30`
- ✅ Low-trust accounts excluded from discovery surfaces

### EPIC I Integration (Ranking v2):
- ✅ Controversial content filtered (no `controversial_content_flags`)
- ✅ Only green content shown in Categories and Recommended Reels

### EPIC M Integration (Observability):
- ✅ Metrics registry ready for Explore metrics (open_rate, to_watch_rate, session_length)

---

## Frontend Integration (To Be Implemented)

### Priority: MEDIUM

**Components Needed:**

1. **ExplorePage.tsx**
   - Call `get_explore_page_v2(user_id)` on mount
   - Render 5 sections: Trending Now, Hashtags, Fresh Creators, Categories, Recommended Reels
   - Session tracking: call `start_explore_session_v1()` on mount, `end_explore_session_v1()` on unmount

2. **TrendingNowSection.tsx**
   - Horizontal scroll list of trending hashtags
   - Click → navigate to Hashtag Page (use `get_hashtag_feed_v1()` from EPIC H)
   - Track click: `track_explore_click_v1(session_id, 'trending_now', 'hashtag', hashtag_id)`

3. **FreshCreatorsSection.tsx**
   - Grid of fresh creator cards (avatar + display_name + reels_count)
   - Click → navigate to Creator Profile

4. **CategoriesSection.tsx**
   - Grid of category cards (icon + display_name + top 5 reels thumbnails)
   - Click category → expand to show more reels
   - Click reel → navigate to Reels player

5. **RecommendedReelsGrid.tsx**
   - Masonry grid of recommended reels (safe pool)
   - Click → navigate to Reels player
   - Track watch: `update_explore_watch_v1(click_id, duration)`

---

## Metrics to Track

### Primary (P1G Spec):
- `explore_open_rate` (Goal: > 30%)
- `explore_to_watch_rate` (Goal: > 15%)
- `explore_session_length` (Goal: > 60 seconds)
- `explore_section_click_distribution` (Trending Now should be 20-30%)

### Secondary:
- `explore_cache_hit_rate` (should be > 80%)
- `explore_fresh_creators_quality` (avg reels_count of clicked creators)
- `explore_category_coverage` (% of categories with >= 5 reels)

---

## Testing Scenarios

### 1. Explore Page Load
```sql
-- Should return 5 sections with items
SELECT jsonb_pretty(public.get_explore_page_v2(
  NULL, -- anonymous
  'seg_default',
  'ru-RU',
  NULL,
  true,
  false
));
```

### 2. Trending Now Section (EPIC H Integration)
```sql
-- Should return trust-weighted trending hashtags
SELECT * FROM public.get_trending_hashtags_v1(10, 30);
```

### 3. Fresh Creators (Quality Filter)
```sql
-- Should return creators with min 3 reels + trust_score >= 30
SELECT * FROM public.get_explore_fresh_creators_v1(12, 3, 30, 30);
```

### 4. Categories (Green Content Only)
```sql
-- Should exclude controversial reels
SELECT * FROM public.get_explore_categories_v1(6, 5);
```

### 5. Session Tracking
```sql
-- Start session
SELECT public.start_explore_session_v1(
  '<user-id>'::UUID,
  'session-key-123',
  'v2.epic-g'
);

-- Track click
SELECT public.track_explore_click_v1(
  '<session-id>'::UUID,
  'trending_now',
  'hashtag',
  '<hashtag-id>',
  NULL,
  1,
  'v2.epic-g'
);

-- End session
SELECT public.end_explore_session_v1('<session-id>'::UUID);
```

### 6. Metrics Calculation
```sql
-- Explore open rate (last 7 days)
SELECT public.calculate_explore_open_rate_v1(7);

-- To-watch rate
SELECT public.calculate_explore_to_watch_rate_v1(7);

-- Session length
SELECT public.calculate_explore_session_length_v1(7);

-- Section distribution
SELECT * FROM public.calculate_explore_section_distribution_v1(7);
```

---

## Dependencies

✅ **Phase 0:** Hashtags, reels, profiles baseline  
✅ **Phase 1 EPIC H:** Trending hashtags (20260224170000, 171000)  
✅ **Phase 1 EPIC L:** Trust profiles (20260224020005)  
✅ **Phase 1 EPIC I:** Controversial content flags (20260224161000)  
✅ **Phase 1 EPIC M:** Metrics registry (20260224140000)

---

## Acceptance Criteria

EPIC G is complete when:
- ✅ Categories implemented (hashtag_categories + mapping)
- ✅ Fresh creators enhanced (quality filter + trust-weighting)
- ✅ Trending Now uses EPIC H trust-weighted trends
- ✅ Safety enforcement (only green content)
- ✅ `get_explore_page_v2()` unified API
- ✅ Session & click tracking implemented
- ✅ Metrics calculation functions implemented
- ⏳ Frontend components implemented (pending)
- ⏳ Metrics tracked in dashboards (pending)
- ⏳ Canary rollout (20% → 100%)

**Current Status:** 7/10 criteria met (Backend 100% complete, Frontend 0%)

---

## Next Steps

### Immediate (This Week):
1. **Seed hashtag-category mappings** (HIGH):
   - Manually or via script, map popular hashtags to categories
   - Target: Each category has >= 20 hashtags

2. **Frontend implementation** (HIGH):
   - ExplorePage + section components
   - Session tracking integration
   - Click/watch tracking

3. **Metrics dashboard** (MEDIUM):
   - Add Explore metrics to observability dashboard
   - Alert on low open_rate (< 20%) or to_watch_rate (< 10%)

### Short-term (Next 2 Weeks):
4. **Canary rollout** (HIGH):
   - Feature flag for Explore (20% traffic)
   - Monitor: open_rate, to_watch_rate, session_length
   - Tune TTL if cache issues

5. **A/B testing** (MEDIUM):
   - Test different exploration ratios (0.30 vs 0.40)
   - Test different section orders

---

## Rollout Strategy

**Phase 1: Backend Ready (Current)**
- Database schema deployed ✅
- RPC functions available ✅
- Analytics tracking ready ✅

**Phase 2: Frontend Beta (20% traffic)**
- Show Explore tab to 20% of users (feature flag)
- Monitor: explore_open_rate, explore_to_watch_rate
- Check: are categories populated with reels?

**Phase 3: Full Rollout (100%)**
- If metrics green (open_rate > 25%, to_watch_rate > 12%)
- Enable Explore for all users
- Make Explore tab default discovery surface

---

## Troubleshooting

### Issue: No items in Categories section
- Check: Are hashtags mapped to categories? Query `hashtag_category_mapping`
- Check: Are there reels with these hashtags? Query `reel_hashtags`
- Fix: Seed category mappings or relax min relevance_score

### Issue: No Fresh Creators
- Check: Are there profiles created in last 30 days?
- Check: Do they have >= 3 published reels?
- Check: Is their trust_score >= 30?
- Fix: Lower thresholds (min_reels=1, min_trust=20)

### Issue: Trending Now empty
- Check: Are trending hashtags calculated? Query `trending_hashtags`
- Check: Is background worker running? (EPIC H `batch_update_trending_hashtags_v1`)
- Fix: Manually run `SELECT batch_update_trending_hashtags_v1(24, 100);`

### Issue: Low explore_to_watch_rate (< 10%)
- Check: Are recommended reels relevant?
- Check: Is exploration_ratio too high? (try 0.30 instead of 0.40)
- Check: Section distribution (maybe users click wrong sections)

---

## References

- [Phase 1 EPIC G Spec](../specs/phase1/P1G-explore-discovery-surface.md)
- [Phase 1 EPIC H Deployment](PHASE1_EPIC_H_DEPLOYMENT.md)
- [Phase 1 EPIC L Deployment](PHASE1_EPIC_L_DEPLOYMENT_SUMMARY.md)
- [Phase 1 EPIC I Deployment](PHASE1_EPIC_I_DEPLOYMENT.md)
- [Phase 1 Progress Report](requirements/phase1-progress-report.md)
