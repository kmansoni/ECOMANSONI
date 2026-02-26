import { Kafka, logLevel } from "kafkajs";
import { createClient } from "@clickhouse/client";
import { z } from "zod";

const BROKERS = String(process.env.ANALYTICS_KAFKA_BROKERS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const TOPIC = process.env.ANALYTICS_KAFKA_TOPIC ?? "analytics.v1";
const GROUP_ID = process.env.ANALYTICS_KAFKA_GROUP_ID ?? "mansoni-analytics-consumer";

const CH_URL = process.env.ANALYTICS_CH_URL ?? "http://localhost:8123";
const CH_DB = process.env.ANALYTICS_CH_DATABASE ?? "analytics";
const CH_USER = process.env.ANALYTICS_CH_USER ?? "default";
const CH_PASSWORD = process.env.ANALYTICS_CH_PASSWORD ?? "";
const AUTO_CREATE = process.env.ANALYTICS_CH_AUTO_CREATE === "1";

const BATCH_SIZE = Number(process.env.ANALYTICS_CONSUMER_BATCH ?? "500");
const FLUSH_MS = Number(process.env.ANALYTICS_CONSUMER_FLUSH_MS ?? "2000");

if (BROKERS.length === 0) {
  throw new Error("Missing ANALYTICS_KAFKA_BROKERS");
}

const eventSchema = z.object({
  v: z.literal(1),
  event_id: z.string().min(8),
  event_ts: z.string(),
  actor_id: z.string().min(1),
  device_id: z.string().min(1),
  session_id: z.string().min(1),
  object_type: z.enum(["story", "reel", "post", "profile"]),
  object_id: z.string().min(1),
  owner_id: z.string().min(1),
  event_type: z.string().min(1),
  event_subtype: z.string().optional(),
  watch_ms: z.number().int().nonnegative().optional(),
  position_index: z.number().int().nonnegative().optional(),
  duration_ms: z.number().int().nonnegative().optional(),
  app_build: z.string().optional(),
  platform: z.enum(["ios", "android", "web"]).optional(),
  network_type: z.string().optional(),
  country_code: z.string().optional(),
  props: z.record(z.unknown()).optional(),
});

const clickhouse = createClient({
  host: CH_URL,
  username: CH_USER,
  password: CH_PASSWORD,
  database: CH_DB,
});

async function ensureSchema() {
  if (!AUTO_CREATE) return;

  await clickhouse.exec({
    query: `CREATE DATABASE IF NOT EXISTS ${CH_DB}`,
  });

  await clickhouse.exec({
    query: `
      CREATE TABLE IF NOT EXISTS ${CH_DB}.events_raw_v1 (
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
      SETTINGS index_granularity = 8192
    `,
  });

  await clickhouse.exec({
    query: `
      CREATE TABLE IF NOT EXISTS ${CH_DB}.events_rollup_5m_v1 (
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
      ORDER BY (object_type, object_id, bucket_start)
    `,
  });

  await clickhouse.exec({
    query: `
      CREATE MATERIALIZED VIEW IF NOT EXISTS ${CH_DB}.mv_rollup_5m_v1
      TO ${CH_DB}.events_rollup_5m_v1
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
      FROM ${CH_DB}.events_raw_v1
      GROUP BY bucket_start, object_type, object_id, owner_id
    `,
  });

  await clickhouse.exec({
    query: `
      CREATE TABLE IF NOT EXISTS ${CH_DB}.events_rollup_day_v1 (
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
      ORDER BY (object_type, object_id, day)
    `,
  });

  await clickhouse.exec({
    query: `
      CREATE MATERIALIZED VIEW IF NOT EXISTS ${CH_DB}.mv_rollup_day_v1
      TO ${CH_DB}.events_rollup_day_v1
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
      FROM ${CH_DB}.events_rollup_5m_v1
      GROUP BY day, object_type, object_id, owner_id
    `,
  });
}

const kafka = new Kafka({
  clientId: "mansoni-analytics-consumer",
  brokers: BROKERS,
  logLevel: logLevel.WARN,
});
const consumer = kafka.consumer({ groupId: GROUP_ID });

let batch = [];
let lastFlush = Date.now();

async function flushBatch() {
  if (batch.length === 0) return;

  const rows = batch;
  batch = [];
  lastFlush = Date.now();

  const payload = rows
    .map((ev) => ({
      event_id: ev.event_id,
      event_ts: ev.event_ts,
      actor_id: ev.actor_id,
      device_id: ev.device_id,
      session_id: ev.session_id,
      object_type: ev.object_type,
      object_id: ev.object_id,
      owner_id: ev.owner_id,
      event_type: ev.event_type,
      event_subtype: ev.event_subtype ?? "",
      watch_ms: ev.watch_ms ?? 0,
      position_index: ev.position_index ?? 0,
      duration_ms: ev.duration_ms ?? 0,
      app_build: ev.app_build ?? "",
      platform: ev.platform ?? "",
      network_type: ev.network_type ?? "",
      country_code: ev.country_code ?? "",
      props: JSON.stringify(ev.props ?? {}),
    }))
    .map((row) => JSON.stringify(row))
    .join("\n");

  await clickhouse.insert({
    table: `${CH_DB}.events_raw_v1`,
    values: payload,
    format: "JSONEachRow",
  });
}

async function run() {
  await ensureSchema();
  await consumer.connect();
  await consumer.subscribe({ topic: TOPIC, fromBeginning: false });

  setInterval(() => {
    if (Date.now() - lastFlush >= FLUSH_MS) {
      void flushBatch();
    }
  }, FLUSH_MS);

  await consumer.run({
    autoCommit: true,
    eachMessage: async ({ message }) => {
      if (!message.value) return;
      let parsed;
      try {
        parsed = JSON.parse(message.value.toString());
      } catch {
        return;
      }
      const result = eventSchema.safeParse(parsed);
      if (!result.success) return;

      batch.push(result.data);
      if (batch.length >= BATCH_SIZE) {
        await flushBatch();
      }
    },
  });
}

run().catch((error) => {
  console.error("[analytics-consumer] fatal:", error);
  process.exit(1);
});
