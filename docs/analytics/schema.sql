CREATE DATABASE IF NOT EXISTS analytics;

CREATE TABLE IF NOT EXISTS analytics.events_raw_v1 (
  event_id String,
  event_ts DateTime64(3),
  actor_id String,
  device_id String,
  session_id String,
  object_type LowCardinality(String),
  object_id String,
  owner_id String,
  event_type LowCardinality(String),
  event_subtype String,
  watch_ms UInt32,
  position_index UInt32,
  duration_ms UInt32,
  app_build String,
  platform LowCardinality(String),
  network_type String,
  country_code String,
  props String
)
ENGINE = MergeTree
PARTITION BY toDate(event_ts)
ORDER BY (object_type, object_id, event_ts, event_id)
SETTINGS index_granularity = 8192;

CREATE TABLE IF NOT EXISTS analytics.events_rollup_5m_v1 (
  bucket_start DateTime,
  object_type LowCardinality(String),
  object_id String,
  owner_id String,
  impressions_state AggregateFunction(uniqExact, String),
  reach_state AggregateFunction(uniqCombined64, String),
  watch_ms_state AggregateFunction(sum, UInt64),
  completes_state AggregateFunction(sum, UInt64),
  exits_state AggregateFunction(sum, UInt64),
  taps_forward_state AggregateFunction(sum, UInt64),
  taps_back_state AggregateFunction(sum, UInt64),
  likes_state AggregateFunction(sum, UInt64),
  reactions_state AggregateFunction(sum, UInt64),
  replies_state AggregateFunction(sum, UInt64),
  shares_state AggregateFunction(sum, UInt64),
  link_clicks_state AggregateFunction(sum, UInt64)
)
ENGINE = AggregatingMergeTree
PARTITION BY toDate(bucket_start)
ORDER BY (object_type, object_id, bucket_start);

CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.mv_rollup_5m_v1
TO analytics.events_rollup_5m_v1
AS
WITH
  event_type = 'view_end'
    AND watch_ms >= 600
    AND ifNull(JSONExtractBool(props, 'instant_skip'), 0) = 0 AS view_valid,
  ifNull(JSONExtractBool(props, 'completed'), 0) AS is_completed,
  ifNull(JSONExtractBool(props, 'on'), 0) AS is_like_on
SELECT
  toStartOfFiveMinute(event_ts) AS bucket_start,
  object_type,
  object_id,
  owner_id,
  uniqExactStateIf(event_id, view_valid) AS impressions_state,
  uniqCombined64StateIf(actor_id, view_valid) AS reach_state,
  sumStateIf(toUInt64(watch_ms), view_valid) AS watch_ms_state,
  sumStateIf(1, view_valid AND is_completed) AS completes_state,
  sumState(if(event_type = 'exit', 1, 0)) AS exits_state,
  sumState(if(event_type = 'tap_forward', 1, 0)) AS taps_forward_state,
  sumState(if(event_type = 'tap_back', 1, 0)) AS taps_back_state,
  sumState(if(event_type = 'like_toggle' AND is_like_on, 1, 0)) AS likes_state,
  sumState(if(event_type = 'reaction', 1, 0)) AS reactions_state,
  sumState(if(event_type = 'comment_send', 1, 0)) AS replies_state,
  sumState(if(event_type = 'share_complete', 1, 0)) AS shares_state,
  sumState(if(event_type = 'link_click', 1, 0)) AS link_clicks_state
FROM analytics.events_raw_v1
GROUP BY bucket_start, object_type, object_id, owner_id;

CREATE TABLE IF NOT EXISTS analytics.events_rollup_day_v1 (
  day Date,
  object_type LowCardinality(String),
  object_id String,
  owner_id String,
  impressions_state AggregateFunction(uniqExact, String),
  reach_state AggregateFunction(uniqCombined64, String),
  watch_ms_state AggregateFunction(sum, UInt64),
  completes_state AggregateFunction(sum, UInt64),
  exits_state AggregateFunction(sum, UInt64),
  taps_forward_state AggregateFunction(sum, UInt64),
  taps_back_state AggregateFunction(sum, UInt64),
  likes_state AggregateFunction(sum, UInt64),
  reactions_state AggregateFunction(sum, UInt64),
  replies_state AggregateFunction(sum, UInt64),
  shares_state AggregateFunction(sum, UInt64),
  link_clicks_state AggregateFunction(sum, UInt64)
)
ENGINE = AggregatingMergeTree
PARTITION BY day
ORDER BY (object_type, object_id, day);

CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.mv_rollup_day_v1
TO analytics.events_rollup_day_v1
AS
SELECT
  toDate(bucket_start) AS day,
  object_type,
  object_id,
  owner_id,
  uniqExactMergeState(impressions_state) AS impressions_state,
  uniqCombined64MergeState(reach_state) AS reach_state,
  sumMergeState(watch_ms_state) AS watch_ms_state,
  sumMergeState(completes_state) AS completes_state,
  sumMergeState(exits_state) AS exits_state,
  sumMergeState(taps_forward_state) AS taps_forward_state,
  sumMergeState(taps_back_state) AS taps_back_state,
  sumMergeState(likes_state) AS likes_state,
  sumMergeState(reactions_state) AS reactions_state,
  sumMergeState(replies_state) AS replies_state,
  sumMergeState(shares_state) AS shares_state,
  sumMergeState(link_clicks_state) AS link_clicks_state
FROM analytics.events_rollup_5m_v1
GROUP BY day, object_type, object_id, owner_id;
