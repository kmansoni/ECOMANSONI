import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { Kafka, logLevel } from "kafkajs";
import { z } from "zod";

const PORT = Number(process.env.ANALYTICS_INGEST_PORT ?? "4010");
const BROKERS = String(process.env.ANALYTICS_KAFKA_BROKERS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const TOPIC = process.env.ANALYTICS_KAFKA_TOPIC ?? "analytics.v1";
const CLIENT_ID = process.env.ANALYTICS_KAFKA_CLIENT_ID ?? "mansoni-analytics-ingest";

if (BROKERS.length === 0) {
  throw new Error("Missing ANALYTICS_KAFKA_BROKERS");
}

const ALLOWED_ORIGINS = String(process.env.ANALYTICS_CORS_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const REQUIRE_API_KEY = Boolean(process.env.ANALYTICS_INGEST_API_KEY);
const API_KEY = process.env.ANALYTICS_INGEST_API_KEY ?? "";

const app = express();
app.use(helmet());
app.use(express.json({ limit: "512kb" }));

app.use(
  rateLimit({
    windowMs: 60_000,
    max: 600,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

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

const batchSchema = z.object({
  v: z.literal(1),
  events: z.array(eventSchema).min(1).max(500),
});

const kafka = new Kafka({
  clientId: CLIENT_ID,
  brokers: BROKERS,
  logLevel: logLevel.WARN,
});
const producer = kafka.producer({
  idempotent: true,
  maxInFlightRequests: 1,
  allowAutoTopicCreation: false,
});

let producerReady = false;
async function ensureProducer() {
  if (producerReady) return;
  await producer.connect();
  producerReady = true;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, producer: producerReady, topic: TOPIC });
});

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin || ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin)) {
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", "content-type, authorization, x-analytics-key");
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    }
    if (req.method === "OPTIONS") return res.status(204).end();
    return next();
  }
  return res.status(403).json({ error: "origin_not_allowed" });
});

app.post("/analytics/events", async (req, res) => {
  if (REQUIRE_API_KEY) {
    const key = req.headers["x-analytics-key"];
    if (!key || key !== API_KEY) {
      return res.status(401).json({ error: "invalid_api_key" });
    }
  }
  const parsed = batchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "bad_request", details: parsed.error.flatten() });
  }

  try {
    await ensureProducer();
    const messages = parsed.data.events.map((ev) => ({
      key: ev.event_id,
      value: JSON.stringify(ev),
      timestamp: String(Date.now()),
    }));

    await producer.send({
      topic: TOPIC,
      messages,
    });

    return res.json({ ok: true, count: messages.length });
  } catch (error) {
    console.error("[analytics-ingest] publish failed:", error);
    return res.status(503).json({ error: "upstream_unavailable" });
  }
});

app.listen(PORT, () => {
  console.log(`[analytics-ingest] listening on :${PORT}`);
});
