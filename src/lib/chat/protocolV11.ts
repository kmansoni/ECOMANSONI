import { supabase } from "@/lib/supabase";

function hashToBucket(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % 100;
}

export function isChatProtocolV11Enabled(): boolean {
  const env = String((import.meta as any)?.env?.VITE_CHAT_PROTOCOL_V11 ?? "").toLowerCase();
  if (env === "true" || env === "1") return true;
  try {
    const forced = localStorage.getItem("chat.protocol.v11.force");
    if (forced === "0" || forced === "false") return false;
    if (forced === "1" || forced === "true") return true;
    const raw = localStorage.getItem("chat.protocol.v11.enabled");
    return raw === "1" || raw === "true";
  } catch {
    return false;
  }
}

export function isChatProtocolV11EnabledForUser(userId: string | null | undefined): boolean {
  if (isChatProtocolV11Enabled()) return true;
  if (!userId) return false;
  const envPercentRaw = String((import.meta as any)?.env?.VITE_CHAT_PROTOCOL_V11_ROLLOUT_PERCENT ?? "");
  const envPercent = Number(envPercentRaw);
  const percent = Number.isFinite(envPercent) ? Math.max(0, Math.min(100, envPercent)) : 0;
  if (percent <= 0) return false;
  if (percent >= 100) return true;
  return hashToBucket(`chat-v11:${userId}`) < percent;
}

export function getOrCreateChatDeviceId(): string {
  const key = "chat.device_id.v11";
  try {
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const next = crypto.randomUUID();
    localStorage.setItem(key, next);
    return next;
  } catch {
    return crypto.randomUUID();
  }
}

export function nextClientWriteSeq(userId: string): number {
  const key = `chat.write_seq.v11.${userId}`;
  try {
    const raw = localStorage.getItem(key);
    const parsed = Number(raw || "0");
    const next = Number.isFinite(parsed) ? parsed + 1 : 1;
    localStorage.setItem(key, String(next));
    return next;
  } catch {
    return Date.now();
  }
}

export function bumpChatMetric(name: string, delta = 1): void {
  const key = `chat.metric.v11.${name}`;
  try {
    const raw = localStorage.getItem(key);
    const current = Number(raw || "0");
    const next = (Number.isFinite(current) ? current : 0) + delta;
    localStorage.setItem(key, String(next));
    window.dispatchEvent(
      new CustomEvent("chat-v11-metric", {
        detail: { name, value: next, delta, ts: Date.now() },
      })
    );
    enqueueMetric(name, delta, { kind: "counter", delta });
  } catch {
    // best-effort local instrumentation
  }
}

export function observeChatMetric(
  name: string,
  value: number,
  extraLabels?: Record<string, unknown>
): void {
  const key = `chat.metric.v11.obs.${name}`;
  try {
    localStorage.setItem(key, String(value));
    const labels = { kind: "gauge", ...(extraLabels || {}) };
    window.dispatchEvent(
      new CustomEvent("chat-v11-metric", {
        detail: { name, value, ts: Date.now(), kind: "observe", labels },
      })
    );
    enqueueMetric(name, value, labels);
  } catch {
    // best-effort local instrumentation
  }
}

type MetricItem = { name: string; value: number; labels: Record<string, unknown> };
const METRIC_FLUSH_INTERVAL_MS = 2000;
const METRIC_MAX_BATCH = 20;
let metricFlushTimer: number | null = null;
const metricQueue: MetricItem[] = [];
let metricFlushInFlight = false;

function enqueueMetric(name: string, value: number, labels: Record<string, unknown>): void {
  metricQueue.push({ name, value, labels });
  if (metricQueue.length > 200) {
    metricQueue.splice(0, metricQueue.length - 200);
  }
  if (metricFlushTimer != null) return;
  metricFlushTimer = window.setTimeout(() => {
    metricFlushTimer = null;
    void flushMetricQueue();
  }, METRIC_FLUSH_INTERVAL_MS);
}

async function flushMetricQueue(): Promise<void> {
  if (metricFlushInFlight) return;
  if (metricQueue.length === 0) return;
  metricFlushInFlight = true;
  try {
    const batch = metricQueue.splice(0, METRIC_MAX_BATCH);
    await Promise.all(
      batch.map((item) =>
        (supabase as any).rpc("chat_ingest_client_metric_v11", {
          p_name: item.name,
          p_value: item.value,
          p_labels: item.labels,
        })
      )
    );
  } catch {
    // drop failed batch; metrics are best-effort and should not affect UX
  } finally {
    metricFlushInFlight = false;
    if (metricQueue.length > 0) {
      if (metricFlushTimer == null) {
        metricFlushTimer = window.setTimeout(() => {
          metricFlushTimer = null;
          void flushMetricQueue();
        }, METRIC_FLUSH_INTERVAL_MS);
      }
    }
  }
}
