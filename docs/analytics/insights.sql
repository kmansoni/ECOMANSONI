-- Daily insights for a single object (story/reel/post/profile).
-- Replace values in WHERE clause before running.
SELECT
  day,
  uniqExactMerge(impressions_state) AS impressions,
  uniqCombined64Merge(reach_state) AS reach,
  sumMerge(watch_ms_state) AS watch_ms_sum,
  if(impressions > 0, watch_ms_sum / impressions, 0) AS avg_watch_ms,
  sumMerge(completes_state) AS completes,
  if(impressions > 0, completes / impressions, 0) AS completion_rate,
  sumMerge(exits_state) AS exits,
  sumMerge(taps_forward_state) AS taps_forward,
  sumMerge(taps_back_state) AS taps_back,
  sumMerge(likes_state) AS likes,
  sumMerge(reactions_state) AS reactions,
  sumMerge(replies_state) AS replies,
  sumMerge(shares_state) AS shares,
  sumMerge(link_clicks_state) AS link_clicks
FROM analytics.events_rollup_day_v1
WHERE object_type = 'reel'
  AND object_id = 'REPLACE_OBJECT_ID'
  AND day BETWEEN toDate('2025-01-01') AND toDate('2025-01-07')
GROUP BY day
ORDER BY day ASC;

-- Aggregate insights for a creator over a period.
SELECT
  uniqExactMerge(impressions_state) AS impressions,
  uniqCombined64Merge(reach_state) AS reach,
  sumMerge(watch_ms_state) AS watch_ms_sum,
  sumMerge(completes_state) AS completes,
  sumMerge(exits_state) AS exits,
  sumMerge(taps_forward_state) AS taps_forward,
  sumMerge(taps_back_state) AS taps_back,
  sumMerge(likes_state) AS likes,
  sumMerge(reactions_state) AS reactions,
  sumMerge(replies_state) AS replies,
  sumMerge(shares_state) AS shares,
  sumMerge(link_clicks_state) AS link_clicks
FROM analytics.events_rollup_day_v1
WHERE owner_id = 'REPLACE_OWNER_ID'
  AND day BETWEEN toDate('2025-01-01') AND toDate('2025-01-31');
