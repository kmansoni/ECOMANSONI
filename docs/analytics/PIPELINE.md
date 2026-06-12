# Analytics Pipeline (Redpanda + ClickHouse)

## Overview
- Frontend emits events to `analytics-ingest`.
- Ingest publishes to Redpanda topic `analytics.v1`.
- Consumer writes raw events to ClickHouse and materializes 5m rollups.

## Components
1. `server/analytics-ingest` — HTTP ingest + validation + Redpanda producer.
2. `server/analytics-consumer` — Redpanda consumer → ClickHouse.
3. `infra/analytics/docker-compose.yml` — local Redpanda + ClickHouse.

## Topics
- `analytics.v1` (retention 7–30 days)
- `analytics.dlq.v1` (future)

## Env
Frontend:
- `VITE_ANALYTICS_INGEST_URL`

Ingest:
- `ANALYTICS_KAFKA_BROKERS`
- `ANALYTICS_KAFKA_TOPIC`
- `ANALYTICS_KAFKA_CLIENT_ID`
- `ANALYTICS_INGEST_PORT`
- `ANALYTICS_CORS_ORIGINS`
- `ANALYTICS_INGEST_API_KEY` (optional)

Consumer:
- `ANALYTICS_KAFKA_BROKERS`
- `ANALYTICS_KAFKA_TOPIC`
- `ANALYTICS_KAFKA_GROUP_ID`
- `ANALYTICS_CH_URL`
- `ANALYTICS_CH_DATABASE`
- `ANALYTICS_CH_USER`
- `ANALYTICS_CH_PASSWORD`
- `ANALYTICS_CH_AUTO_CREATE` (set to `1` for local)
- `ANALYTICS_CONSUMER_BATCH`
- `ANALYTICS_CONSUMER_FLUSH_MS`

## Dedupe notes
- Producer is idempotent, but consumer is at-least-once.
- Raw events are append-only; duplicates are possible on crash/retry.
- Rollups use `uniqExactState(event_id)` for impressions and `uniqCombined64State(actor_id)` for reach.
- `watch_ms` sums are still vulnerable to duplicates if the same `event_id` is replayed.
  If this becomes a problem, add a Redis/KeyDB dedupe cache or batch rebuild with `GROUP BY event_id` in ClickHouse.

## Rollup rules
- `view_end` counts as an impression only if `watch_ms >= 600` and `props.instant_skip != true`.
- Reach is unique `actor_id` on valid `view_end`.
- Completion uses `props.completed = true` on valid `view_end`.

## Insights
- See `docs/analytics/insights.sql` for example ClickHouse queries.

## Local dev
1. `docker compose -f infra/analytics/docker-compose.yml up -d`
2. Create topic:
   - `rpk topic create analytics.v1`
3. Start ingest:
   - `node server/analytics-ingest/index.mjs`
4. Start consumer:
   - `node server/analytics-consumer/index.mjs`
